import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCrisLogin } from "@/lib/crisCreds";
import { fetchDailySalesReport, fetchTransactionsReport } from "@/services/cris";
import { storeCrisReport, storeCrisPumpReadings } from "@/services/crisStore";
import { isoDate } from "@/lib/format";

/**
 * Unattended hourly CRIS fetch, triggered by a droplet cron (see DEPLOY.md).
 * Authenticated by a shared secret (CRON_SECRET) rather than an admin session.
 * Two pulls per run:
 *  1. Daily Sales Report — from the last cached day (to refresh a day that was
 *     incomplete when first cached) through today.
 *  2. Transaction Report — yesterday + today, reduced to per-pump
 *     opening/closing totalizers (meter-reading cross-check).
 */

export const maxDuration = 300;

/** Calendar date in IST (YYYY-MM-DD), optionally offset by whole days. */
function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = await getCrisLogin();
  if (!login) {
    return NextResponse.json({ error: "CRIS login not configured" }, { status: 400 });
  }

  // Re-fetch the last cached day (may have been incomplete) through today.
  const maxAgg = await prisma.crisDaily.aggregate({ _max: { businessDate: true } });
  const fromDate = maxAgg._max.businessDate ? isoDate(maxAgg._max.businessDate) : istDate(-7);
  const toDate = istDate(0);

  const result = await fetchDailySalesReport({ ...login, fromDate, toDate });

  if (!result.ok || !result.report) {
    return NextResponse.json(
      { error: result.error ?? "Fetch failed", step: result.step, from: fromDate, to: toDate },
      { status: 502 },
    );
  }

  const imported = await storeCrisReport(result.report);
  const days = new Set(result.report.rows.map((r) => r.businessDate)).size;

  // 2) Per-pump meter readings from the Transaction Report: yesterday + today
  //    (yesterday so the final closing after midnight is captured). A failure
  //    here doesn't fail the whole run — the DSR data is already stored.
  const meters: { imported?: number; error?: string; step?: string } = {};
  const txn = await fetchTransactionsReport({ ...login, fromDate: istDate(-1), toDate });
  if (txn.ok && txn.report) {
    meters.imported = await storeCrisPumpReadings(txn.report);
  } else {
    meters.error = txn.error ?? "Fetch failed";
    meters.step = txn.step;
  }

  return NextResponse.json({ ok: true, imported, days, from: fromDate, to: toDate, meters });
}
