import fs from "fs";
import type { Page } from "playwright-core";
import { parseCrisReport, type CrisReport } from "./crisReport";

/**
 * Headless automation of the CRIS "Daily Sales Report": logs in, opens the
 * report, filters by RO SAP code + date range (Product = All), downloads the
 * XLS, parses it, then logs out.
 *
 * Selectors below were reverse-engineered against the live CRIS portal
 * (Angular + PrimeNG). CRIS is slow, so each step has a generous settle wait.
 *
 * ⚠ CRIS enforces a single active session. This must log out cleanly or the
 * next login (yours or the next fetch) is blocked until the session times out.
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
  username: string;
  password: string;
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

export async function fetchDailySalesReport(opts: FetchOpts): Promise<FetchResult> {
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
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
      acceptDownloads: true,
    });
    const page = await ctx.newPage();

    // 1) Login. The portal can be slow to serve the login page, and the
    //    dashboard takes several seconds to render after submit.
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
    if (!loaded) {
      return { ok: false, step, error: "Could not load the CRIS login page (network/timeout)." };
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
      return {
        ok: false,
        step,
        error:
          "Login failed — wrong credentials, or another CRIS session is active (single-session). Log out of CRIS and retry in a few minutes.",
      };
    }

    // 2) Open the Daily Sales Report — the filter modal auto-opens.
    step = "open-report";
    await page.goto(`${BASE}/home/layout/report/dsr`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(8000);
    const sapLabel = page.locator("text=/Select RO SAP Code/i").first();
    const filterReady = await sapLabel
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (!filterReady) {
      // Fallback: explicitly click the Filter button to open the modal.
      await page
        .locator('.myBtn[title="Filter"], button[title="Filter"]')
        .first()
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(8000);
      await sapLabel.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    }

    // 3) Filter: RO SAP code (PrimeNG multiselect) + date range.
    step = "filter";
    const sap = opts.sapCode || opts.username;
    await sapLabel.click().catch(() => {}); // open the multiselect panel
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

    await page
      .fill('input[formcontrolname="strFromDate"]', `${opts.fromDate}T00:00`)
      .catch(() => {});
    await page
      .fill('input[formcontrolname="strToDate"]', `${opts.toDate}T23:59`)
      .catch(() => {});
    await page.waitForTimeout(2000);

    await page.locator('.submit-btn:has-text("Ok")').last().click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(8000); // the report grid loads

    // 4) Download the XLS (round download-icon → "Excel" option in the popup).
    step = "download";
    const buf = await downloadXls(page);
    if (!buf) {
      return { ok: false, step, error: "Could not download the report XLS." };
    }

    // 5) Parse.
    step = "parse";
    const report = parseCrisReport(buf);
    if (report.rows.length === 0) {
      return { ok: false, step, error: "Downloaded report had no MS/HSD rows." };
    }

    // 6) Log out (important — CRIS allows only one active session).
    step = "logout";
    await logout(page).catch(() => {});

    return { ok: true, report };
  } catch (e) {
    return { ok: false, step, error: e instanceof Error ? e.message : "Unknown error" };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function downloadXls(page: Page): Promise<Buffer | null> {
  // The download control is a round icon at the top-right of the grid. Clicking
  // it reveals XLS/PDF buttons ~5s later; we pick XLS.
  await page.locator("span.download-icon").click().catch(() => {});
  await page.waitForTimeout(5000);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    page.locator("div.download-xls").click().catch(() => {}),
  ]);
  if (!download) return null;

  const p = await download.path().catch(() => null);
  if (p) return fs.readFileSync(p);
  const stream = await download.createReadStream().catch(() => null);
  if (!stream) return null;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function logout(page: Page) {
  // Click the avatar (top-right) to open the profile drawer, then the Logout row.
  await page.locator("img.profilePic").click().catch(() => {});
  await page.waitForTimeout(3000); // the profile drawer slides open
  await page.locator(".profileDrower > div > div:nth-child(5)").click().catch(() => {});
  await page
    .waitForFunction(() => /\/login/.test(location.pathname), { timeout: 20000 })
    .catch(() => {});
}
