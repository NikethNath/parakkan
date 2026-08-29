import * as XLSX from "xlsx";

/**
 * Parser for the Paytm for Business transaction report (CSV).
 *
 * Paytm pays UPI and card into the bank as one credit, so the bank statement
 * cannot say how much of a day was which. This report can: it is one row per
 * customer payment, carrying the payment mode. Rows are summed per collection
 * day into the GPay and POS figures the reconcile table compares against the
 * staff sheets.
 *
 * The file itself is never kept — it holds customer VPAs, mobile numbers and
 * card last-4 digits, none of which this app has any business storing. Only the
 * two totals per day survive parsing.
 */

export type PaytmChannel = "GPAY" | "POS";

export interface PaytmDayTotals {
  date: string; // YYYY-MM-DD, the day the money was collected
  gpay: number;
  pos: number;
  gpayCount: number;
  posCount: number;
}

export interface ParsedPaytmReport {
  days: PaytmDayTotals[];
  countedRows: number;
  /** Rows that were not a successful collection: failed, aborted, refunds. */
  skippedRows: number;
  /** Payment modes the rules didn't recognise — surfaced, never silently dropped. */
  unknownModes: string[];
  unknownModeRows: number;
}

const cell = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .replace(/^'+|'+$/g, "") // Paytm wraps most values in a literal apostrophe
    .trim();

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A mode starting with UPI is GPay money even when a card funds it
 * (`UPI_CREDIT_CARD` is a RuPay credit card paid over UPI): the customer
 * scanned the QR, so the staff wrote it on the sheet as a UPI collection, not
 * as a swipe on the card machine. Order matters — UPI is tested before CARD.
 */
export function classifyPaytmMode(mode: string): PaytmChannel | null {
  const m = cell(mode).toUpperCase();
  if (!m) return null;
  if (m.startsWith("UPI")) return "GPAY";
  if (m.includes("CARD")) return "POS";
  return null;
}

export function parsePaytmReport(text: string): ParsedPaytmReport {
  const wb = XLSX.read(text, { type: "string", raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = sheet
    ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" })
    : [];
  if (aoa.length < 2) {
    return { days: [], countedRows: 0, skippedRows: 0, unknownModes: [], unknownModeRows: 0 };
  }

  // Look columns up by name — the export carries 100+ of them and their order
  // is not something to depend on.
  const header = (aoa[0] ?? []).map((h) => cell(h).toUpperCase());
  const col = (name: string) => header.indexOf(name.toUpperCase());
  const iDate = col("Transaction_Date");
  const iStatus = col("Status");
  const iAmount = col("Amount");
  const iMode = col("Payment_Mode");
  const iType = col("Transaction_Type");
  if (iDate < 0 || iStatus < 0 || iAmount < 0 || iMode < 0) {
    return { days: [], countedRows: 0, skippedRows: 0, unknownModes: [], unknownModeRows: 0 };
  }

  const byDay = new Map<string, PaytmDayTotals>();
  let countedRows = 0;
  let skippedRows = 0;
  let unknownModeRows = 0;
  const unknownModes = new Set<string>();

  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.length === 0) continue;

    const date = cell(row[iDate]).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // blank or trailing line

    // Only money actually taken: successful, and an acquiring (collection) row
    // rather than a refund or an adjustment.
    const ok =
      cell(row[iStatus]).toUpperCase() === "SUCCESS" &&
      (iType < 0 || cell(row[iType]).toUpperCase() === "ACQUIRING");
    if (!ok) {
      skippedRows++;
      continue;
    }

    const amount = Number(cell(row[iAmount]));
    if (!Number.isFinite(amount) || amount <= 0) {
      skippedRows++;
      continue;
    }

    const channel = classifyPaytmMode(String(row[iMode]));
    if (!channel) {
      unknownModes.add(cell(row[iMode]) || "(blank)");
      unknownModeRows++;
      continue;
    }

    const day = byDay.get(date) ?? { date, gpay: 0, pos: 0, gpayCount: 0, posCount: 0 };
    if (channel === "GPAY") {
      day.gpay += amount;
      day.gpayCount++;
    } else {
      day.pos += amount;
      day.posCount++;
    }
    byDay.set(date, day);
    countedRows++;
  }

  const days = [...byDay.values()]
    .map((d) => ({ ...d, gpay: round2(d.gpay), pos: round2(d.pos) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    countedRows,
    skippedRows,
    unknownModes: [...unknownModes].sort(),
    unknownModeRows,
  };
}
