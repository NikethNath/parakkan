import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { istToday } from "@/lib/format";
import { parsePaytmReports } from "@/services/paytmReport";
import { PAYTM_REPORT, saveReportFigures } from "@/lib/bankFigures";

/**
 * Imports Paytm for Business transaction reports (CSV) and turns them into the
 * per-day GPay/POS figures the reconcile table needs. UPI and its variants
 * count as GPay, card as POS — see `classifyPaytmMode`.
 *
 * Several files are accepted at once because a weekly or monthly export comes
 * split into numbered parts (`…_001.csv`, `…_002.csv`). They must be summed
 * before writing: a day stored by replacement would otherwise end up holding
 * only the part that happened to be imported last.
 *
 * **The file is never written to disk and is not kept.** It is read out of the
 * request body in memory, reduced to two totals per day, and dropped when this
 * function returns; nothing else about it is stored. That matters beyond disk
 * space — the export carries customer VPAs, mobile numbers and card last-4
 * digits, which this app has no reason to hold.
 */

// This outlet runs ~750 payments a day, so a month is around 15 MB. The cap is
// a guard against the wrong file entirely, since parsing holds it in memory.
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 24;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const files = (formData?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `That's ${files.length} files — import at most ${MAX_FILES} parts at a time.` },
      { status: 400 },
    );
  }
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Those files total ${(totalBytes / 1048576).toFixed(0)} MB — too large for a Paytm report.`,
      },
      { status: 400 },
    );
  }

  const parsed = parsePaytmReports(await Promise.all(files.map((f) => f.text())));

  if (parsed.days.length === 0) {
    return NextResponse.json(
      {
        error:
          parsed.unknownModeRows > 0
            ? `No payments could be classified — unrecognised payment modes: ${parsed.unknownModes.join(", ")}.`
            : "No successful payments found — is this the Paytm transaction report?",
      },
      { status: 400 },
    );
  }

  // A report pulled during the day only holds part of it, and would otherwise
  // overwrite a complete figure with a partial one.
  const today = istToday();
  const partialDay = parsed.days.some((d) => d.date === today) ? today : null;

  // Which days a previous import already covered. Importing the parts of a
  // split export in separate requests would quietly replace a day that spans
  // two of them, so the replacement is reported rather than done silently.
  const dates = parsed.days.map((d) => new Date(`${d.date}T00:00:00.000Z`));
  const replaced = await prisma.bankTxn.findMany({
    where: { businessDate: { in: dates }, source: PAYTM_REPORT },
    select: { businessDate: true },
    distinct: ["businessDate"],
    orderBy: { businessDate: "asc" },
  });

  await prisma.$transaction((tx) =>
    saveReportFigures(
      tx,
      parsed.days.map((d) => ({ businessDate: d.date, gpay: d.gpay, pos: d.pos })),
      user.uid,
    ),
  );

  return NextResponse.json({
    ok: true,
    days: parsed.days,
    fileCount: files.length,
    countedRows: parsed.countedRows,
    skippedRows: parsed.skippedRows,
    duplicateRows: parsed.duplicateRows,
    unknownModes: parsed.unknownModes,
    unknownModeRows: parsed.unknownModeRows,
    partialDay,
    replacedDays: replaced.map((r) => r.businessDate.toISOString().slice(0, 10)),
    from: parsed.days[0].date,
    to: parsed.days[parsed.days.length - 1].date,
  });
}
