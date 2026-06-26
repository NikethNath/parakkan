import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCrisCredentials } from "@/lib/crisCreds";
import { fetchDailySalesReport } from "@/services/cris";
import { storeCrisReport } from "@/services/crisStore";
import { isoDate } from "@/lib/format";

/**
 * Unattended daily CRIS fetch, triggered by a droplet cron (see DEPLOY.md).
 * Authenticated by a shared secret (CRON_SECRET) rather than an admin session.
 * Re-fetches from the last cached day (to refresh a day that was incomplete
 * when first cached) through today, then upserts the rows.
 */

export const maxDuration = 180;

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

  const creds = await getCrisCredentials();
  if (!creds) {
    return NextResponse.json({ error: "CRIS login not configured" }, { status: 400 });
  }

  // Re-fetch the last cached day (may have been incomplete) through today.
  const maxAgg = await prisma.crisDaily.aggregate({ _max: { businessDate: true } });
  const fromDate = maxAgg._max.businessDate ? isoDate(maxAgg._max.businessDate) : istDate(-7);
  const toDate = istDate(0);

  const result = await fetchDailySalesReport({
    username: creds.username,
    password: creds.password,
    fromDate,
    toDate,
    sapCode: creds.username, // RO SAP code == CRIS user id for this dealer
  });

  if (!result.ok || !result.report) {
    return NextResponse.json(
      { error: result.error ?? "Fetch failed", step: result.step, from: fromDate, to: toDate },
      { status: 502 },
    );
  }

  const imported = await storeCrisReport(result.report);
  return NextResponse.json({ ok: true, imported, from: fromDate, to: toDate });
}
