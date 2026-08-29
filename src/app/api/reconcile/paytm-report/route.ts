import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { istToday } from "@/lib/format";
import { parsePaytmReport } from "@/services/paytmReport";
import { CSV_NARRATION, saveTypedFigures } from "@/lib/bankFigures";

/**
 * Imports a Paytm for Business transaction report (CSV) and turns it into the
 * per-day GPay/POS figures the reconcile table needs. UPI and its variants
 * count as GPay, card as POS — see `classifyPaytmMode`.
 *
 * **The file is never written to disk and is not kept.** It is read out of the
 * request body in memory, reduced to two totals per day, and dropped when this
 * function returns; nothing else about it is stored. That matters beyond disk
 * space — the export carries customer VPAs, mobile numbers and card last-4
 * digits, which this app has no reason to hold.
 */

// Roughly a year of transactions at this outlet's volume; a guard against a
// wrong file, since the whole thing is held in memory while it parses.
const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(0)} MB — too large to be a Paytm report.` },
      { status: 400 },
    );
  }

  const parsed = parsePaytmReport(await file.text());

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

  await prisma.$transaction((tx) =>
    saveTypedFigures(
      tx,
      parsed.days.map((d) => ({ businessDate: d.date, gpay: d.gpay, pos: d.pos })),
      user.uid,
      CSV_NARRATION,
    ),
  );

  return NextResponse.json({
    ok: true,
    days: parsed.days,
    countedRows: parsed.countedRows,
    skippedRows: parsed.skippedRows,
    unknownModes: parsed.unknownModes,
    unknownModeRows: parsed.unknownModeRows,
    partialDay,
  });
}
