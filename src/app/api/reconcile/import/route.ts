import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { istToday, isoDate } from "@/lib/format";
import { detectImportKind } from "@/services/importKind";
import { parseStatement } from "@/services/statement";
import { parsePaytmReports } from "@/services/paytmReport";
import {
  PAYTM_REPORT,
  bankFigureAt,
  bankFigureSelect,
  saveReportFigures,
  sumBankFigures,
} from "@/lib/bankFigures";
import { saveStatementTxns, type StatementFileResult } from "@/lib/statementImport";

/**
 * The one import the reconcile page offers: hand it the Paytm for Business
 * transaction report, an SBI bank statement export, or both at once, in any
 * order.
 *
 * Both are needed because money still arrives two ways. Paytm settles UPI and
 * card as a single bank credit, so only its own report can split a day into
 * GPay and POS — but regulars still scan the old PhonePe QR, and that money
 * lands in the main account and shows up nowhere in Paytm's report. A day's
 * GPay is therefore the report's figure **plus** the statement's PhonePe
 * credit; `sumBankFigures` is what adds them, and the `days` returned here are
 * read back through it so the reply shows the real resulting total.
 *
 * Which parser a file goes to is decided by reading it, not by its name — see
 * `detectImportKind`.
 *
 * **A Paytm report is never written to disk and never kept.** It is read out of
 * the request in memory, reduced to two totals per day, and dropped when this
 * function returns. That matters beyond disk space: the export carries customer
 * VPAs, mobile numbers and card last-4 digits, which this app has no reason to
 * hold. Bank statements keep only the credits they describe.
 */

// This outlet runs ~750 payments a day, so a month of Paytm report is around
// 15 MB. The cap guards against the wrong file entirely, since parsing holds it
// in memory.
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 24;

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const list = (names: string[]) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

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
      { error: `That's ${files.length} files — import at most ${MAX_FILES} at a time.` },
      { status: 400 },
    );
  }
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Those files total ${(totalBytes / 1048576).toFixed(0)} MB — too large to import at once.`,
      },
      { status: 400 },
    );
  }

  const read = await Promise.all(
    files.map(async (f) => ({ name: f.name, text: await f.text() })),
  );
  const sorted = read.map((f) => ({ ...f, kind: detectImportKind(f.text) }));

  // One unreadable file rejects the whole import rather than half of it, so
  // there's never a doubt about what went in and what has to be picked again.
  const workbooks = sorted.filter((f) => f.kind === "BINARY");
  if (workbooks.length > 0) {
    // SBI's net banking offers a real spreadsheet too ("Account Statement
    // Report"), laid out differently and carrying none of the collection
    // narrations — so say which download to take rather than just refusing.
    return NextResponse.json(
      {
        error:
          `${list(workbooks.map((f) => f.name))} ${workbooks.length === 1 ? "is a spreadsheet file" : "are spreadsheet files"}, not a text export. ` +
          `Take SBI's statement download whose rows start with "Txn Date", or the Paytm transaction report as .csv. Nothing was imported.`,
      },
      { status: 400 },
    );
  }

  const unknown = sorted.filter((f) => f.kind === null);
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error:
          `Couldn't tell what ${list(unknown.map((f) => f.name))} ${unknown.length === 1 ? "is" : "are"} — ` +
          `expected the Paytm transaction report (.csv) or an SBI statement export (.xls). Nothing was imported.`,
      },
      { status: 400 },
    );
  }

  const reportFiles = sorted.filter((f) => f.kind === "PAYTM_REPORT");
  const statementFiles = sorted.filter((f) => f.kind === "STATEMENT");

  // Every part of a split Paytm export is parsed as one import: a day routinely
  // straddles two parts, and a day is stored by replacement, so summing has to
  // happen before anything is written.
  const report = reportFiles.length ? parsePaytmReports(reportFiles.map((f) => f.text)) : null;
  const statements = statementFiles.map((f) => ({
    fileName: f.name,
    parsed: parseStatement(f.text),
  }));

  const statementTxns = statements.reduce((n, s) => n + s.parsed.txns.length, 0);
  const needsSplit = statements.reduce((n, s) => n + s.parsed.skippedCombined, 0);
  const reportDays = report?.days ?? [];

  // A statement holding nothing but combined Paytm settlements is still a valid
  // upload — there was simply nothing in it to attribute.
  if (reportDays.length === 0 && statementTxns === 0 && needsSplit === 0) {
    return NextResponse.json(
      {
        error:
          report && report.unknownModeRows > 0
            ? `No payments could be classified — unrecognised payment modes: ${report.unknownModes.join(", ")}.`
            : report
              ? "No successful payments found — is this the Paytm transaction report?"
              : "No GPay/POS credits found — is this the right statement file?",
      },
      { status: 400 },
    );
  }

  // A report pulled during the day only holds part of it, and would otherwise
  // overwrite a complete figure with a partial one.
  const today = istToday();
  const partialDay = reportDays.some((d) => d.date === today) ? today : null;

  // Which days a previous import already covered. Importing the parts of a
  // split export in separate requests would quietly replace a day that spans
  // two of them, so the replacement is reported rather than done silently.
  const replaced = reportDays.length
    ? await prisma.bankTxn.findMany({
        where: {
          businessDate: { in: reportDays.map((d) => toDate(d.date)) },
          source: PAYTM_REPORT,
        },
        select: { businessDate: true },
        distinct: ["businessDate"],
        orderBy: { businessDate: "asc" },
      })
    : [];

  const statementResults: StatementFileResult[] = await prisma.$transaction(
    async (tx) => {
      if (reportDays.length > 0) {
        await saveReportFigures(
          tx,
          reportDays.map((d) => ({ businessDate: d.date, gpay: d.gpay, pos: d.pos })),
          user.uid,
        );
      }
      return statements.length > 0 ? saveStatementTxns(tx, statements, user.uid) : [];
    },
    { timeout: 30_000 },
  );

  // Read the touched days back through the same adder the reconcile table uses,
  // so the reply states the figure that actually now stands for each day —
  // Paytm's share and PhonePe's together — rather than just this upload's half.
  const dates = [
    ...new Set([
      ...reportDays.map((d) => d.date),
      ...statements.flatMap((s) => s.parsed.txns.map((t) => t.businessDate)),
    ]),
  ].sort();
  const figures = sumBankFigures(
    dates.length
      ? await prisma.bankTxn.findMany({
          where: { businessDate: { in: dates.map(toDate) } },
          select: bankFigureSelect,
        })
      : [],
  );
  const days = dates.map((date) => {
    const g = bankFigureAt(figures, date, "GPAY");
    const p = bankFigureAt(figures, date, "POS");
    return {
      date,
      gpay: g?.amount ?? 0,
      gpayReport: g?.report ?? 0,
      gpayStatement: g?.statement ?? 0,
      pos: p?.amount ?? 0,
      posReport: p?.report ?? 0,
      posStatement: p?.statement ?? 0,
    };
  });

  return NextResponse.json({
    ok: true,
    days,
    fileCount: files.length,
    report: report
      ? {
          fileCount: reportFiles.length,
          dayCount: reportDays.length,
          countedRows: report.countedRows,
          skippedRows: report.skippedRows,
          duplicateRows: report.duplicateRows,
          unknownModes: report.unknownModes,
          unknownModeRows: report.unknownModeRows,
          from: reportDays[0]?.date ?? null,
          to: reportDays[reportDays.length - 1]?.date ?? null,
          partialDay,
          replacedDays: replaced.map((r) => isoDate(r.businessDate)),
        }
      : null,
    statement: statements.length
      ? {
          fileCount: statements.length,
          files: statementResults,
          inserted: statementResults.reduce((n, r) => n + r.inserted, 0),
          duplicates: statementResults.reduce((n, r) => n + r.duplicates, 0),
          gpay: statementResults.reduce((n, r) => n + r.gpay, 0),
          pos: statementResults.reduce((n, r) => n + r.pos, 0),
          needsSplit,
        }
      : null,
  });
}
