/**
 * Tells the two files the reconcile page accepts apart by looking *inside*
 * them, so one file picker can take either in any mix.
 *
 * Names are no help: the SBI export is tab-separated text carrying a misleading
 * `.xls` extension, and every part of a Paytm export is a `.csv`. Both are
 * plain text, and each has an unmistakable header row.
 */

export type ImportKind = "STATEMENT" | "PAYTM_REPORT";

/** What a sniff can conclude. `BINARY` is a real spreadsheet file (a modern
 *  `.xlsx` is a zip, a legacy `.xls` an OLE container) rather than either text
 *  export — worth telling apart from an unreadable file so the message can say
 *  which download to take instead. */
export type ImportSniff = ImportKind | "BINARY" | null;

// Far more than either header block needs — the statement's is ~20 lines, the
// Paytm report's is the very first line (a long one: ~115 columns).
const HEAD_BYTES = 64 * 1024;
const HEAD_LINES = 80;

export function detectImportKind(text: string): ImportSniff {
  for (const line of text.slice(0, HEAD_BYTES).split(/\r?\n/, HEAD_LINES)) {
    // The row parseStatement() itself keys off to find the table.
    if (line.split("\t")[0]?.trim() === "Txn Date") return "STATEMENT";
    // The Paytm report's header, named for the columns its parser looks up.
    const u = line.toUpperCase();
    if (u.includes("TRANSACTION_DATE") && u.includes("PAYMENT_MODE")) return "PAYTM_REPORT";
  }

  // Nothing recognised. Both exports are text, so bytes that can't be text at
  // all mean a genuine spreadsheet was picked — SBI's net banking also offers
  // an "Account Statement Report" workbook, whose columns are laid out
  // differently and which carries none of the collection narrations. Reading
  // it as UTF-8 leaves NULs, or U+FFFD where a byte wasn't valid.
  if (/[\u0000\uFFFD]/.test(text.slice(0, 512))) return "BINARY";
  return null;
}
