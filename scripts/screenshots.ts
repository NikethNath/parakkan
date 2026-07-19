/**
 * Regenerates every screenshot in docs/screenshots from scratch — run after a
 * visual change so the README always matches the app:
 *
 *   npm run screenshots
 *
 * What it does (fully self-contained, ~2 min):
 *   1. creates a THROWAWAY database (hpcl_screenshots) in the local Postgres
 *      container — the real dev/prod data is never read, so no real figure can
 *      leak into a screenshot,
 *   2. migrates + seeds it with three coherent demo days: 18 sheets across 4
 *      staff with continuous pump totalizers, official CRIS data with one
 *      planted meter mismatch, and bank settlements with one flagged gap,
 *   3. starts `next dev` on its own port against that database,
 *   4. drives headless Chrome through the admin and employee flows (including
 *      actually clicking "Fix → CRIS" so the audit-trail shot shows a real
 *      logged change) and writes the PNGs to docs/screenshots/,
 *   5. tears everything down and drops the throwaway database.
 *
 * Needs: the local Postgres container up (docker compose up -d) and Chrome
 * (set CHROME_PATH if it's somewhere unusual).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type Page, type Browser } from "playwright-core";
import { computeEntry } from "../src/lib/calc";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const PORT = 3105;
const BASE = `http://localhost:${PORT}`;
const PG_CONTAINER = process.env.PG_CONTAINER ?? "hpcl-postgres";
const DEMO_DB = "hpcl_screenshots";
const DEMO_URL = `postgresql://hpcl:hpcl@localhost:5433/${DEMO_DB}`;
const ADMIN = { user: "admin", pass: "changeme123" };

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const p = [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((c) => fs.existsSync(c));
  if (!p) throw new Error("Chrome not found — set CHROME_PATH.");
  return p;
}

const sql = (q: string) =>
  execSync(`docker exec ${PG_CONTAINER} psql -U hpcl -c ${JSON.stringify(q)}`, { stdio: "pipe" });

// ---------------------------------------------------------------------------
// Demo data — three days ending on the most recent completed day, so the
// month-scoped pages (CRIS, GPay/POS) show it without touching their filters.
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;
const isoDay = (t: Date) => t.toISOString().slice(0, 10);
const lastFullDay = new Date(Date.now() - DAY_MS);
// Keep all three days inside one month so the default month views show all of them.
if (lastFullDay.getUTCDate() < 3) lastFullDay.setUTCDate(3);
const DAYS = [2, 1, 0].map((back) => isoDay(new Date(lastFullDay.getTime() - back * DAY_MS)));
const FLAG_DAY = DAYS[2]; // the planted meter mismatch + bank gap live here
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;

const RATE = { MS: 107.44, HSD: 96.36 } as const;

const PUMPS = [
  { pump: 1, product: "HSD", base: 902514.3 },
  { pump: 2, product: "HSD", base: 878203.75 },
  { pump: 3, product: "MS", base: 1590396.81 },
  { pump: 4, product: "MS", base: 1412880.1 },
  { pump: 5, product: "MS", base: 1655772.45 },
  { pump: 6, product: "MS", base: 1238041.9 },
] as const;

// litres dispensed per pump per half-day [morning, evening], per day index
const LITRES: Record<number, [number, number][]> = {
  1: [[612.4, 548.22], [587.16, 640.9], [559.31, 601.47]],
  2: [[498.75, 522.3], [534.62, 489.18], [612.05, 570.66]],
  3: [[338.12, 296.5], [312.44, 351.7], [305.86, 322.15]],
  4: [[287.6, 305.22], [298.15, 276.4], [318.72, 289.05]],
  5: [[356.9, 312.08], [334.25, 361.52], [349.1, 327.66]],
  6: [[262.33, 291.75], [278.9, 254.12], [301.44, 269.8]],
};

const DELTAS = [-120, 60, 0, -45, 85, -20, 40, -75, 15, -160, 25, -30, 50, -90, 10, 0, -55, 70];

function denomsFor(target: number) {
  let t = Math.max(0, Math.floor(target));
  const coins = round2(Math.max(0, target) - t);
  const q = { q2000: 0, q500: 0, q200: 0, q100: 0, q50: 0, q20: 0, q10: 0, q5: 0 };
  for (const d of [500, 200, 100, 50, 20, 10, 5] as const) {
    q[`q${d}`] = Math.floor(t / d);
    t -= q[`q${d}`] * d;
  }
  return { ...q, coins: round2(coins + t) };
}

async function seed(prisma: PrismaClient) {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const hash = await bcrypt.hash("staff123", 10);
  for (const u of [
    { name: "Anil P", username: "anil" },
    { name: "Manoj K", username: "manoj" },
  ]) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, role: "EMPLOYEE", passwordHash: hash },
    });
  }
  const emp: Record<string, number> = {};
  for (const u of await prisma.user.findMany({ where: { role: "EMPLOYEE" } })) emp[u.username] = u.id;

  const cursor: Record<number, number> = {};
  for (const p of PUMPS) cursor[p.pump] = p.base;
  let deltaI = 0;

  for (let di = 0; di < DAYS.length; di++) {
    const day = DAYS[di];
    const staffNet = { MS: 0, HSD: 0 };
    const staffTest = { MS: 0, HSD: 0 };
    let gpaySum = 0;
    let posSum = 0;

    const open: Record<number, number> = {};
    const mid: Record<number, number> = {};
    const close: Record<number, number> = {};
    for (const p of PUMPS) {
      const [m, e] = LITRES[p.pump][di];
      open[p.pump] = round2(cursor[p.pump]);
      mid[p.pump] = round2(open[p.pump] + m);
      close[p.pump] = round2(mid[p.pump] + e);
      cursor[p.pump] = close[p.pump];
    }

    const sheets = [
      { shift: "MORNING", user: "rajesh", product: "MS", pumps: [3, 4] },
      { shift: "MORNING", user: "anil", product: "MS", pumps: [5, 6] },
      { shift: "MORNING", user: "suresh", product: "HSD", pumps: [1, 2] },
      { shift: "EVENING", user: "manoj", product: "MS", pumps: [3, 4] },
      { shift: "EVENING", user: "rajesh", product: "MS", pumps: [5, 6] },
      { shift: "EVENING", user: "suresh", product: "HSD", pumps: [1, 2] },
    ] as const;

    for (const s of sheets) {
      const [a, b] = s.pumps;
      let n1Open = s.shift === "MORNING" ? open[a] : mid[a];
      const n1Close = s.shift === "MORNING" ? mid[a] : close[a];
      const n2Open = s.shift === "MORNING" ? open[b] : mid[b];
      const n2Close = s.shift === "MORNING" ? mid[b] : close[b];

      // The planted Meter-tab mismatch: staff misreads pump 3's opening on the
      // last day by +0.05 vs the official CRIS totalizer.
      if (day === FLAG_DAY && s.shift === "MORNING" && a === 3) n1Open = round2(n1Open + 0.05);

      const testLitres = s.shift === "MORNING" ? 5 : 0;
      const rate = RATE[s.product];
      const gross = round2(n1Close - n1Open + (n2Close - n2Open));
      const fuelApprox = (gross - testLitres) * rate;
      const gpay = Math.round((fuelApprox * 0.34) / 10) * 10;
      const pos = Math.round((fuelApprox * 0.22) / 10) * 10;

      const oilLines = day === FLAG_DAY && s.user === "rajesh" && s.shift === "MORNING"
        ? [{ name: "2T Oil 500 ml", amount: 180 }] : [];
      const expenseLines = s.shift === "EVENING" && s.pumps[0] === 5
        ? [{ description: "Tea & snacks", amount: 60 }] : [];
      const salaryLines = day === DAYS[1] && s.user === "anil"
        ? [{ description: "Advance — Anil", amount: 500 }] : [];
      const creditLines = s.product === "HSD" && s.shift === "MORNING"
        ? [{ customer: "K.T. Transports", amount: 3000 }] : [];

      const base = {
        product: s.product, rate, n1Open, n1Close, n2Open, n2Close, testLitres,
        q2000: 0, q500: 0, q200: 0, q100: 0, q50: 0, q20: 0, q10: 0, q5: 0,
        coins: 0, gpay, pos, oilLines, expenseLines, salaryLines, creditLines,
      };
      const c0 = computeEntry(base);
      const delta = DELTAS[deltaI++ % DELTAS.length];
      const cash = denomsFor(round2(-c0.shortExcess + delta));
      const c = computeEntry({ ...base, ...cash });

      const verified = !(day === FLAG_DAY && s.shift === "EVENING");
      await prisma.dailyEntry.create({
        data: {
          employeeId: emp[s.user], businessDate: D(day), shift: s.shift, product: s.product,
          rate, n1Open, n1Close, n2Open, n2Close, testLitres,
          q2000: cash.q2000, q500: cash.q500, q200: cash.q200, q100: cash.q100,
          q50: cash.q50, q20: cash.q20, q10: cash.q10, q5: cash.q5, coins: cash.coins,
          gpay, pos,
          cashTotal: c.cashTotal, oilTotal: c.oilTotal, expensesTotal: c.expensesTotal,
          salaryTotal: c.salaryTotal, creditTotal: c.creditTotal,
          grossLitres: c.grossLitres, netSalableLitres: c.netSalableLitres,
          fuelExpected: c.fuelExpected, shortExcess: c.shortExcess,
          status: verified ? "VERIFIED" : "SUBMITTED",
          submittedAt: new Date(`${day}T${s.shift === "MORNING" ? "08:45" : "17:05"}:00.000Z`),
          verifiedById: verified ? admin.id : null,
          verifiedAt: verified ? new Date(`${day}T17:30:00.000Z`) : null,
          oilLines: { create: oilLines.map((l) => ({ ...l, qty: 0, unitPrice: 0 })) },
          expenseLines: { create: expenseLines },
          salaryLines: { create: salaryLines },
          creditLines: { create: creditLines },
        },
      });
      staffNet[s.product] = round2(staffNet[s.product] + c.netSalableLitres);
      staffTest[s.product] = round2(staffTest[s.product] + testLitres);
      gpaySum += gpay;
      posSum += pos;
    }

    // Official CRIS per-pump totalizers (what the staff should have written).
    for (const p of PUMPS) {
      await prisma.crisPumpDaily.create({
        data: {
          businessDate: D(day), pump: p.pump, product: p.product,
          openTotalizer: open[p.pump], closeTotalizer: close[p.pump],
          txnCount: Math.round((close[p.pump] - open[p.pump]) / 8),
        },
      });
    }

    // Official daily sale litres — green except MS on the middle day (−0.42 L).
    for (const prod of ["MS", "HSD"] as const) {
      const off = day === DAYS[1] && prod === "MS" ? 0.42 : di === 0 ? 0.03 : -0.02;
      const litres = round2(staffNet[prod] + off);
      await prisma.crisDaily.create({
        data: {
          businessDate: D(day), product: prod,
          officialSaleLitres: litres,
          officialSaleAmount: round2(litres * RATE[prod]),
          testLitres: staffTest[prod],
        },
      });
    }

    // Bank statement: GPay settles T+1 in two credits, POS as one bulk posting.
    const upload = await prisma.bankUpload.upsert({
      where: { id: 1 },
      update: {},
      create: { uploadedById: admin.id, fileName: "DEMO_SBI_statement.xls" },
    });
    const t1 = new Date(D(day).getTime() + DAY_MS);
    const gTotal = day === FLAG_DAY ? gpaySum - 150 : gpaySum; // flagged gap
    const g1 = Math.round(gTotal * 0.6);
    const pTotal = di === 0 ? posSum - 4 : di === 1 ? posSum + 12 : posSum;
    await prisma.bankTxn.createMany({
      data: [
        { uploadId: upload.id, txnDate: t1, businessDate: D(day), amount: g1, channel: "GPAY", narration: "UPI SETTLEMENT PHONEPE" },
        { uploadId: upload.id, txnDate: t1, businessDate: D(day), amount: gTotal - g1, channel: "GPAY", narration: "UPI SETTLEMENT PHONEPE" },
        { uploadId: upload.id, txnDate: t1, businessDate: D(day), amount: pTotal, channel: "POS", narration: `BULK POSTING ${day.slice(8)}${day.slice(5, 7)}` },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------
const hideDevUi = "nextjs-portal, #__next-build-watcher { display: none !important; }";

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"]').fill(user);
  await page.locator('input[type="password"]').fill(pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: hideDevUi }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("  ✓", name);
}

async function capture(browser: Browser, prisma: PrismaClient) {
  const rajesh = await prisma.user.findUniqueOrThrow({ where: { username: "rajesh" } });
  const flagged = await prisma.dailyEntry.findFirstOrThrow({
    where: { employeeId: rajesh.id, businessDate: D(FLAG_DAY), shift: "MORNING", product: "MS" },
  });
  const editable = await prisma.dailyEntry.findFirstOrThrow({
    where: { employeeId: rajesh.id, businessDate: D(FLAG_DAY), shift: "EVENING", product: "MS" },
  });
  const range = `from=${DAYS[0]}&to=${DAYS[2]}`;

  // -- desktop / admin ------------------------------------------------------
  const desk = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await desk.newPage();
  page.on("dialog", (d) => void d.accept());
  await login(page, ADMIN.user, ADMIN.pass);

  await page.goto(`${BASE}/admin?${range}`);
  await page.waitForLoadState("networkidle");
  await shot(page, "admin-dashboard");

  // Meter tab with the planted red flag still unfixed…
  await page.goto(`${BASE}/admin/meter?${range}`);
  await page.waitForLoadState("networkidle");
  const fixBtn = page.locator('button:has-text("Fix → CRIS")');
  if ((await fixBtn.count()) !== 1) throw new Error("expected exactly one Fix → CRIS button");
  await shot(page, "meter-cris");
  // …then actually fix it so the audit-trail shot shows a real logged change.
  await fixBtn.first().click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/admin/cris`);
  await page.waitForLoadState("networkidle");
  await shot(page, "cris-compare");

  await page.goto(`${BASE}/admin/reconcile`);
  await page.waitForLoadState("networkidle");
  await shot(page, "bank-reconcile");

  await page.goto(`${BASE}/admin/shortexcess?staff=${rajesh.id}&${range}`);
  await page.waitForLoadState("networkidle");
  await shot(page, "salary");

  await page.goto(`${BASE}/admin/entries/${flagged.id}`);
  await page.waitForLoadState("networkidle");
  await page.locator('button:has-text("Edit")').first().click();
  await page.waitForTimeout(800);
  await shot(page, "entry-review");
  await desk.close();

  // -- audit card at a narrower viewport for a card-shaped crop -------------
  const narrow = await browser.newContext({
    viewport: { width: 920, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const n = await narrow.newPage();
  await login(n, ADMIN.user, ADMIN.pass);
  await n.goto(`${BASE}/admin/entries/${flagged.id}`);
  await n.waitForLoadState("networkidle");
  await n.addStyleTag({ content: hideDevUi }).catch(() => {});
  await n
    .locator("text=Edit history")
    .locator("xpath=ancestor::div[1]")
    .first()
    .screenshot({ path: path.join(OUT, "audit-trail.png") });
  console.log("  ✓ audit-trail");
  await narrow.close();

  // -- phone / employee -----------------------------------------------------
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });
  const p = await phone.newPage();
  await login(p, "rajesh", "staff123");
  await p.goto(`${BASE}/employee/sheet/${editable.id}`);
  await p.waitForLoadState("networkidle");
  await p.locator(':is(button, a):has-text("Edit this sheet")').first().click();
  await p.locator("text=meter readings").first().waitFor({ timeout: 20000 });
  await p.addStyleTag({ content: hideDevUi }).catch(() => {});

  await p.locator("text=meter readings").first().scrollIntoViewIfNeeded();
  await shot(p, "employee-sheet");

  await p.locator("text=Cash counted").first().scrollIntoViewIfNeeded();
  await shot(p, "denominations");
  await phone.close();
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
async function waitForServer(timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("dev server did not come up");
}

async function main() {
  const chrome = chromePath();
  fs.mkdirSync(OUT, { recursive: true });

  console.log(`→ throwaway db ${DEMO_DB}`);
  sql(`DROP DATABASE IF EXISTS ${DEMO_DB};`);
  sql(`CREATE DATABASE ${DEMO_DB};`);

  let server: ChildProcess | undefined;
  let browser: Browser | undefined;
  const prisma = new PrismaClient({ datasourceUrl: DEMO_URL });
  try {
    console.log("→ migrate + seed");
    const env = {
      ...process.env,
      DATABASE_URL: DEMO_URL,
      ADMIN_USERNAME: ADMIN.user,
      ADMIN_PASSWORD: ADMIN.pass,
      NODE_ENV: "development" as const,
    };
    execSync("npx prisma migrate deploy", { cwd: ROOT, env, stdio: "pipe" });
    execSync("npx tsx prisma/seed.ts", { cwd: ROOT, env, stdio: "pipe" });
    await seed(prisma);

    console.log(`→ next dev :${PORT}`);
    server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
      cwd: ROOT,
      env,
      stdio: "ignore",
      detached: true,
    });
    await waitForServer(120000);

    console.log("→ capturing");
    browser = await chromium.launch({ executablePath: chrome });
    await capture(browser, prisma);
    console.log(`done — PNGs in ${path.relative(ROOT, OUT)}/`);
  } finally {
    await browser?.close().catch(() => {});
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
    }
    await prisma.$disconnect().catch(() => {});
    // Give the server a moment to release its DB connections, then drop.
    await new Promise((r) => setTimeout(r, 2000));
    sql(`DROP DATABASE IF EXISTS ${DEMO_DB} WITH (FORCE);`);
    console.log("→ cleaned up (server stopped, throwaway db dropped)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
