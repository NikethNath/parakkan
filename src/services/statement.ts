/**
 * Parser for the dealer's SBI corporate statements (tab-separated text with a
 * `.xls` name). See docs/statement-format.md for the full spec.
 *
 * Card money has moved accounts, so a full month now needs *two* statements:
 *   - the main current account  — GPay (PhonePe, T+1) and, until 19 Jul 2026,
 *     card settlements as SBI BULK POSTING rows carrying a DDMM tail;
 *   - the Paytm settlement account — card settlements from Aug 2026, and from
 *     25 Aug 2026 card *and* UPI together in one credit.
 * Both are parsed by this one function; each credit is mapped to the business
 * date it was actually collected on. A credit that cannot be attributed to a
 * single channel is skipped rather than guessed at — see PAYTM_COMBINED_FROM.
 */

export type Channel = "GPAY" | "POS" | "OTHER";

export interface ParsedTxn {
  txnDate: string; // YYYY-MM-DD, the bank posting date
  businessDate: string; // YYYY-MM-DD, the day it was actually collected
  amount: number;
  channel: Channel;
  narration: string;
}

export interface ParsedStatement {
  accountNumber?: string;
  txns: ParsedTxn[];
  skippedOther: number;
  /** Of those, the combined Paytm settlements — days whose GPay/POS split has
   *  to be typed in by hand. Reported so the upload can say so. */
  skippedCombined: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** SBI dates the two accounts differently: the main current account exports
 *  `07/08/2026`, the Paytm settlement account `7 Aug 2026`. Accept both. */
function parseTxnDate(s: string): { y: number; m: number; d: number } | null {
  const t = s.trim();
  const num = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (num) return { d: +num[1], m: +num[2], y: +num[3] };

  const named = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
  if (named) {
    const mo = MONTHS.indexOf(named[2].toLowerCase()) + 1;
    if (mo > 0) return { d: +named[1], m: mo, y: +named[3] };
  }
  return null;
}

function shift(y: number, mo: number, d: number, deltaDays: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const isPaytm = (lower: string) => lower.includes("paytm");

/**
 * The first business date on which Paytm settled UPI *and* card in a single
 * credit. Before it, a Paytm credit was the card machine alone and is real POS
 * money; from it, one credit covers both with nothing in the row to split them.
 *
 * The rule has to be dated rather than read off the narration: the two eras
 * differ only in NEFT vs RTGS, which just reflects the ₹2L RTGS threshold, not
 * what the money was. Determined from the statements — PhonePe's last (partial)
 * credit covers 25 Aug and Paytm's first large credit covers the same day.
 */
export const PAYTM_COMBINED_FROM = "2026-08-25";

export function classify(narration: string, businessDate?: string): Channel {
  const t = narration.toLowerCase();
  if (t.includes("phonepe limited")) return "GPAY";
  if (t.includes("bulk posting") && t.includes("sbip_cr_parakkan")) return "POS";
  if (isPaytm(t)) {
    // Combined settlements aren't attributable to a channel, so they're left
    // out entirely; the day's GPay/POS split is typed in from the Paytm app.
    return businessDate && businessDate >= PAYTM_COMBINED_FROM ? "OTHER" : "POS";
  }
  return "OTHER";
}

export function parseStatement(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  let accountNumber: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const first = cells[0]?.trim();
    if (first === "Txn Date") {
      headerIdx = i;
      break;
    }
    if (first?.startsWith("Account Number")) {
      accountNumber = cells[1]?.trim().replace(/^_/, "");
    }
  }

  const txns: ParsedTxn[] = [];
  let skippedOther = 0;
  let skippedCombined = 0;
  if (headerIdx === -1) return { accountNumber, txns, skippedOther, skippedCombined };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < 8) continue;

    const txn = parseTxnDate(cols[0]);
    if (!txn) continue;

    const narration = (cols[2] ?? "").trim();
    const amount = parseFloat((cols[6] ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(amount) || amount <= 0) continue; // credits only

    // Only SBI's own BULK POSTING rows date themselves, via a DDMM tail. Paytm
    // is excluded explicitly so a narration that happens to end in digits can
    // never be read as a business date.
    const tagged = isPaytm(narration.toLowerCase())
      ? null
      : narration.match(/(\d{2})(\d{2})--\s*$/);

    let b: { y: number; m: number; d: number };
    if (tagged) {
      const bd = +tagged[1];
      const bmo = +tagged[2];
      let year = txn.y;
      if (Date.UTC(year, bmo - 1, bd) > Date.UTC(txn.y, txn.m - 1, txn.d)) year -= 1; // Dec→Jan rollover
      b = { y: year, m: bmo, d: bd };
    } else {
      // T+1: PhonePe and Paytm each send one lump the morning after the day
      // they collected, with nothing in the narration to date it.
      b = shift(txn.y, txn.m, txn.d, -1);
    }

    // Classified only once the business date is known — whether a Paytm credit
    // is card-only or a combined settlement depends on which day it covers.
    const businessDate = ymd(b.y, b.m, b.d);
    const channel = classify(narration, businessDate);
    if (channel === "OTHER") {
      skippedOther++;
      if (isPaytm(narration.toLowerCase())) skippedCombined++;
      continue;
    }

    txns.push({
      txnDate: ymd(txn.y, txn.m, txn.d),
      businessDate,
      amount: Math.round(amount * 100) / 100,
      channel,
      narration,
    });
  }

  return { accountNumber, txns, skippedOther, skippedCombined };
}
