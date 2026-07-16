import fs from "fs";
import type { Page } from "playwright-core";
import { parseCrisReport, type CrisReport } from "./crisReport";
import { parseCrisTransactions, type CrisTransactionsReport } from "./crisTransactions";

/**
 * Headless automation of CRIS reports. Two fetchers share one session flow:
 *  - fetchDailySalesReport   → "Daily Sales Report" (official per-day sale litres)
 *  - fetchTransactionsReport → "Transaction Report" (per-pump start/end totalizers)
 *
 * Flow: log in (pre-authenticated dealer link preferred, username/password
 * fallback) → open the report route → fill the Filter modal (RO SAP code +
 * date range) → download the XLS → parse → log out.
 *
 * Selectors were reverse-engineered against the live CRIS portal (Angular +
 * PrimeNG). CRIS is slow, so each step has a generous settle wait.
 *
 * ⚠ CRIS enforces a single active session. Logout ALWAYS runs (even on
 * failure) or the next login — automated or yours — is blocked until the
 * session times out.
 */

const BASE = "https://cris.hpcl.co.in/HPCL";

function chromePath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

export interface FetchOpts {
  // Preferred: a pre-authenticated dealer link (dealerlogin?ro=…) that signs in
  // with no username/password form. If absent, falls back to username/password.
  loginUrl?: string;
  username?: string;
  password?: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  sapCode?: string;
}

export interface FetchResult {
  ok: boolean;
  report?: CrisReport;
  error?: string;
  step?: string;
}

export interface TxnFetchResult {
  ok: boolean;
  report?: CrisTransactionsReport;
  error?: string;
  step?: string;
}

/** Sign in. Returns an error message, or null on success. */
async function login(page: Page, opts: FetchOpts): Promise<string | null> {
  if (opts.loginUrl) {
    let opened = false;
    for (let a = 1; a <= 3 && !opened; a++) {
      try {
        await page.goto(opts.loginUrl, { waitUntil: "commit", timeout: 120000 });
        opened = true;
      } catch {
        await page.waitForTimeout(2500);
      }
    }
    if (!opened) return "Could not open the CRIS dealer login link (network/timeout).";
    // The link redirects to the dashboard once the session is set.
    await page
      .waitForFunction(() => !/\/(dealerlogin|login)\b/.test(location.pathname), { timeout: 60000 })
      .catch(() => {});
    await page.waitForTimeout(15000);
    if (/\/(dealerlogin|login)\b/.test(page.url())) {
      return "Dealer login link didn't sign in — it may have expired, or another CRIS session is active. Log out of CRIS and retry.";
    }
    return null;
  }

  let loaded = false;
  for (let a = 1; a <= 3 && !loaded; a++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "commit", timeout: 120000 });
      await page.waitForSelector("#strUserId", { timeout: 60000 });
      loaded = true;
    } catch {
      await page.waitForTimeout(2500);
    }
  }
  if (!loaded) return "Could not load the CRIS login page (network/timeout).";
  if (!opts.username || !opts.password) {
    return "No CRIS login configured (dealer link or username/password).";
  }
  await page.waitForTimeout(2000);
  await page.fill("#strUserId", opts.username);
  await page.fill("#password", opts.password);
  await page.click("#submitbtn");
  await page
    .waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 })
    .catch(() => {});
  await page.waitForTimeout(15000); // CRIS dashboard is slow to come up after login
  if (/\/login/.test(page.url())) {
    return "Login failed — wrong credentials, or another CRIS session is active (single-session). Log out of CRIS and retry in a few minutes.";
  }
  return null;
}

/** Open a report route and wait for its "Filter Criteria" modal (auto-opens;
 *  falls back to clicking the Filter button). */
async function openReportFilter(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  const sapLabel = page.locator("text=/Select RO SAP Code/i").first();
  const ready = await sapLabel
    .waitFor({ state: "visible", timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    await page
      .locator('.myBtn[title="Filter"], button[title="Filter"]')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(8000);
    await sapLabel.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  }
}

/** Fill the filter modal: tick the RO SAP code, set the date range, click Ok. */
async function applyFilter(
  page: Page,
  sap: string,
  fromDate: string,
  toDate: string,
): Promise<void> {
  await page.locator("text=/Select RO SAP Code/i").first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await page
    .locator(".p-multiselect-item, .p-dropdown-item, li[role=option]")
    .filter({ hasText: sap })
    .first()
    .click()
    .catch(() => {}); // tick the RO option
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape").catch(() => {}); // close the panel covering the form
  await page.waitForTimeout(3000);

  await page.fill('input[formcontrolname="strFromDate"]', `${fromDate}T00:00`).catch(() => {});
  await page.fill('input[formcontrolname="strToDate"]', `${toDate}T23:59`).catch(() => {});
  await page.waitForTimeout(2000);

  await page.locator('.submit-btn:has-text("Ok")').last().click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000); // the report grid loads
}

/** Shared session runner: launch → login → report → filter → download → parse
 *  → (always) logout. */
async function runReport<T>(
  opts: FetchOpts,
  route: string,
  parse: (buf: Buffer) => T,
  emptyError: (r: T) => string | null,
): Promise<{ ok: boolean; report?: T; error?: string; step?: string }> {
  const exe = chromePath();
  if (!exe) {
    return { ok: false, step: "launch", error: "Chrome not found — set CHROME_PATH." };
  }
  // Lazy import so the browser dep is only loaded when actually fetching.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  let step = "login";
  let outerPage: Page | null = null;
  let loggedIn = false;
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    outerPage = page; // kept for a best-effort logout in `finally`

    const loginError = await login(page, opts);
    if (loginError) return { ok: false, step, error: loginError };
    loggedIn = true;

    step = "open-report";
    await openReportFilter(page, route);

    step = "filter";
    const sap = opts.sapCode || opts.username || "";
    await applyFilter(page, sap, opts.fromDate, opts.toDate);

    step = "download";
    const buf = await downloadXls(page);
    if (!buf) {
      return { ok: false, step, error: "Could not download the report XLS." };
    }

    step = "parse";
    const report = parse(buf);
    const empty = emptyError(report);
    if (empty) return { ok: false, step, error: empty };

    return { ok: true, report };
  } catch (e) {
    return { ok: false, step, error: e instanceof Error ? e.message : "Unknown error" };
  } finally {
    // Always log out (even on failure) — CRIS allows a single active session, so
    // a dangling session would block the next hourly run and your own login.
    if (outerPage && loggedIn) await logout(outerPage).catch(() => {});
    await browser.close().catch(() => {});
  }
}

/** "Daily Sales Report": official per-day/product sale litres. */
export async function fetchDailySalesReport(opts: FetchOpts): Promise<FetchResult> {
  return runReport(opts, "/home/layout/report/dsr", parseCrisReport, (r) =>
    r.rows.length === 0 ? "Downloaded report had no MS/HSD rows." : null,
  );
}

/** "Transaction Report": per-pump opening/closing totalizers for each day in
 *  the range (pumps 1–2 HSD, 3–6 MS). */
export async function fetchTransactionsReport(opts: FetchOpts): Promise<TxnFetchResult> {
  return runReport(opts, "/home/layout/report/transaction", parseCrisTransactions, (r) =>
    r.rows.length === 0 ? "Downloaded report had no transactions." : null,
  );
}

async function downloadXls(page: Page): Promise<Buffer | null> {
  const ctx = page.context();
  // The download control is a round icon at the top-right of the grid. Clicking
  // it opens a small menu with XLS/PDF options.
  await page.locator("span.download-icon").click().catch(() => {});
  const xls = page.locator("div.download-xls");
  await xls.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  // CRIS emits the download on the browser context, not this exact page, so a
  // page-level wait misses it. Wait at the context level.
  const [download] = await Promise.all([
    ctx.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    xls.click().catch(() => {}),
  ]);
  if (!download) return null;

  // Read into memory, then delete from disk immediately — these exports hold
  // customer data and would otherwise pile up in the container's temp dir.
  const p = await download.path().catch(() => null);
  if (p) {
    const buf = fs.readFileSync(p);
    await download.delete().catch(() => {});
    return buf;
  }
  const stream = await download.createReadStream().catch(() => null);
  if (!stream) return null;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  await download.delete().catch(() => {});
  return Buffer.concat(chunks);
}

async function logout(page: Page) {
  // Close any stray modal first so nothing intercepts the profile clicks.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1000);
  // Avatar → profile drawer → Logout → "Confirm" dialog. CRIS requires the
  // confirm, or the session stays active (single-session). The dialog's class
  // names are minified, so target the stable button text.
  await page.locator("img.profilePic").click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2500); // the profile drawer slides open
  await page
    .locator(".profileDrower")
    .getByText("Logout", { exact: true })
    .first()
    .click({ timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(2500); // the "Are you sure… logout?" dialog appears
  await page
    .getByText("Confirm", { exact: true })
    .last() // the dialog TITLE is also "Confirm"; the button is the last match
    .click({ timeout: 10000 })
    .catch(() => {});
  await page
    .waitForFunction(() => /\/login/.test(location.pathname), { timeout: 20000 })
    .catch(() => {});
}
