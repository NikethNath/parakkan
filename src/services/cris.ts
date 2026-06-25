import fs from "fs";
import type { Page } from "playwright-core";
import { parseCrisReport, type CrisReport } from "./crisReport";

/**
 * Headless automation of the CRIS "Daily Sales Report": logs in, opens the
 * report, filters by RO SAP code + date range (Product = All), downloads the
 * XLS, parses it, then logs out.
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
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let step = "login";
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
      acceptDownloads: true,
    });
    const page = await ctx.newPage();

    // 1) Login
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#strUserId", { timeout: 30000 });
    await page.fill("#strUserId", opts.username);
    await page.fill("#password", opts.password);
    await page.click("#submitbtn");
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    if (/\/login/.test(page.url())) {
      return {
        ok: false,
        step,
        error:
          "Login failed — wrong credentials, or another CRIS session is active (single-session). Log out of CRIS and retry in a few minutes.",
      };
    }

    // 2) Open the Daily Sales Report
    step = "open-report";
    await page.goto(`${BASE}/home/layout/report/dsr`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3500);
    await page.locator('button:has-text("Filter")').first().click().catch(() => {});
    await page.waitForTimeout(1500);

    // 3) Filter: dates + RO SAP code (Product left as default "All")
    step = "filter";
    await page
      .fill('input[formcontrolname="strFromDate"]', `${opts.fromDate}T00:00`)
      .catch(() => {});
    await page
      .fill('input[formcontrolname="strToDate"]', `${opts.toDate}T23:59`)
      .catch(() => {});
    await selectSapCode(page, opts.sapCode);

    await page.locator('button:has-text("Ok")').first().click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 4) Download the XLS
    step = "download";
    const buf = await downloadXls(page);
    if (!buf) {
      return { ok: false, step, error: "Could not download the report XLS." };
    }

    // 5) Parse
    step = "parse";
    const report = parseCrisReport(buf);
    if (report.rows.length === 0) {
      return { ok: false, step, error: "Downloaded report had no MS/HSD rows." };
    }

    // 6) Log out (best-effort, important for single-session)
    step = "logout";
    await logout(page).catch(() => {});

    return { ok: true, report };
  } catch (e) {
    return { ok: false, step, error: e instanceof Error ? e.message : "Unknown error" };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function selectSapCode(page: Page, sap?: string) {
  // Native <select> first.
  const nativeCount = await page.locator("select").count().catch(() => 0);
  if (nativeCount > 0) {
    const sel = page.locator("select").first();
    const options = await sel.locator("option").allTextContents().catch(() => []);
    let idx = sap ? options.findIndex((o) => o.includes(sap)) : -1;
    if (idx < 0) idx = options.findIndex((o) => /\d{3,}/.test(o)); // first code-looking option
    if (idx >= 0) await sel.selectOption({ index: idx }).catch(() => {});
    return;
  }
  // Custom dropdown: click the "Select RO SAP Code" trigger, then the option.
  const trigger = page.locator("text=Select RO SAP Code").first();
  if (await trigger.count().catch(() => 0)) {
    await trigger.click().catch(() => {});
    await page.waitForTimeout(800);
    const opt = sap
      ? page.locator(`[role=option]:has-text("${sap}"), li:has-text("${sap}"), mat-option:has-text("${sap}")`).first()
      : page.locator("[role=option], mat-option, li").first();
    await opt.click().catch(() => {});
  }
}

async function downloadXls(page: Page): Promise<Buffer | null> {
  // Trigger the download control (top-right of the grid). Try several patterns.
  const triggers = [
    'button[title*="Download" i]',
    '[aria-label*="Download" i]',
    '[class*="download" i]',
    'mat-icon:has-text("download")',
    'mat-icon:has-text("file_download")',
  ];
  for (const sel of triggers) {
    const l = page.locator(sel).first();
    if (await l.count().catch(() => 0)) {
      await l.click().catch(() => {});
      break;
    }
  }
  await page.waitForTimeout(800);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    (async () => {
      // A menu may offer PDF/XLS — pick XLS/Excel.
      const xls = page
        .locator('text=/\\bxls(x)?\\b/i, text=/excel/i, [aria-label*="xls" i], [title*="xls" i]')
        .first();
      if (await xls.count().catch(() => 0)) await xls.click().catch(() => {});
    })(),
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
  // Open the profile menu (top-right) then click logout.
  const profile = page
    .locator('[class*="profile" i], [class*="user" i], img[alt*="user" i], text=/parakkan petroleum/i')
    .first();
  if (await profile.count().catch(() => 0)) {
    await profile.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  const out = page.locator('text=/log ?out/i, text=/sign ?out/i').first();
  if (await out.count().catch(() => 0)) {
    await out.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}
