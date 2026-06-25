/**
 * Parser for the dealer's SBI corporate statement (tab-separated text with a
 * `.xls` name). See docs/statement-format.md for the full spec.
 *
 * Extracts GPay (PhonePe, T+1) and POS (BULK POSTING, DDMM tail) credits and
 * maps each to the business date it was collected.
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
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parseDMY(s: string): { y: number; m: number; d: number } | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? { d: +m[1], m: +m[2], y: +m[3] } : null;
}

function shift(y: number, mo: number, d: number, deltaDays: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function classify(narration: string): Channel {
  const t = narration.toLowerCase();
  if (t.includes("phonepe limited")) return "GPAY";
  if (t.includes("bulk posting") && t.includes("sbip_cr_parakkan")) return "POS";
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
  if (headerIdx === -1) return { accountNumber, txns, skippedOther };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < 8) continue;

    const txn = parseDMY(cols[0]);
    if (!txn) continue;

    const narration = (cols[2] ?? "").trim();
    const amount = parseFloat((cols[6] ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(amount) || amount <= 0) continue; // credits only

    const channel = classify(narration);
    if (channel === "OTHER") {
      skippedOther++;
      continue;
    }

    let b: { y: number; m: number; d: number };
    if (channel === "GPAY") {
      b = shift(txn.y, txn.m, txn.d, -1); // T+1 settlement
    } else {
      const mm = narration.match(/(\d{2})(\d{2})--\s*$/);
      if (mm) {
        let year = txn.y;
        const bd = +mm[1];
        const bmo = +mm[2];
        const cand = Date.UTC(year, bmo - 1, bd);
        if (cand > Date.UTC(txn.y, txn.m - 1, txn.d)) year -= 1; // Dec→Jan rollover
        b = { y: year, m: bmo, d: bd };
      } else {
        b = { y: txn.y, m: txn.m, d: txn.d };
      }
    }

    txns.push({
      txnDate: ymd(txn.y, txn.m, txn.d),
      businessDate: ymd(b.y, b.m, b.d),
      amount: Math.round(amount * 100) / 100,
      channel,
      narration,
    });
  }

  return { accountNumber, txns, skippedOther };
}
