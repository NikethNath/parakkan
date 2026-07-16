import * as XLSX from "xlsx";
import type { Product } from "./crisReport";

/**
 * Parser for the CRIS "Transaction Report Details" .xlsx (sheet "Transactions").
 * Every fuelling transaction carries the pump's Start/End Totalizer, so the
 * day's opening reading per pump = the earliest transaction's Start Totalizer
 * and the closing = the latest transaction's End Totalizer. Totalizers only
 * ever increase, so min(start) / max(end) computes the same thing without
 * depending on row order.
 *
 * Used to cross-check the opening/closing meter readings staff type into their
 * daily sheets. Pumps 1–2 dispense HSD, 3–6 MS (validated against the Product
 * column of each row).
 */

export const PUMP_PRODUCT: Record<number, Product> = {
  1: "HSD",
  2: "HSD",
  3: "MS",
  4: "MS",
  5: "MS",
  6: "MS",
};

export interface CrisPumpRow {
  businessDate: string; // YYYY-MM-DD (IST calendar date)
  pump: number;
  product: Product;
  openTotalizer: number;
  closeTotalizer: number;
  txnCount: number;
}

export interface CrisTransactionsReport {
  sapCode?: string;
  roName?: string;
  fromDate?: string;
  toDate?: string;
  rows: CrisPumpRow[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Calendar date (YYYY-MM-DD) from a "Transaction Date & Time" cell. Handles
 *  raw Excel day serials (day-fraction, timezone-less wall clock) and
 *  "DD-MM-YYYY hh:mm:ss" strings. */
function cellDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial: days since 1899-12-30. The integer part is the calendar day.
    const ms = (Math.floor(v) - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const m = String(v).trim().match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function parseCrisTransactions(buf: Buffer | ArrayBuffer): CrisTransactionsReport {
  const wb = XLSX.read(buf, { type: "buffer" }); // raw serials — no tz surprises
  const ws = wb.Sheets["Transactions"] ?? wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  let sapCode: string | undefined,
    roName: string | undefined,
    fromDate: string | undefined,
    toDate: string | undefined;
  for (const r of aoa.slice(0, 5)) {
    for (let i = 0; i < r.length; i++) {
      const c = String(r[i]).trim();
      if (c.startsWith("RO SAP Code")) sapCode = String(r[i + 1]).trim();
      else if (c.startsWith("RO Name")) roName = String(r[i + 1]).trim();
      else if (c.startsWith("From Date")) fromDate = String(r[i + 1]).trim();
      else if (c.startsWith("To Date")) toDate = String(r[i + 1]).trim();
    }
  }

  const hIdx = aoa.findIndex((r) => String(r[0]).trim() === "S.no");
  if (hIdx === -1) return { sapCode, roName, fromDate, toDate, rows: [] };

  const header = aoa[hIdx].map((h) => String(h).trim());
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iWhen = find(/transaction date/i);
  const iPump = find(/^pump no/i);
  const iProduct = find(/^product$/i);
  const iStart = find(/^start totalizer/i);
  const iEnd = find(/^end totalizer/i);
  if (iPump === -1 || iStart === -1 || iEnd === -1) {
    return { sapCode, roName, fromDate, toDate, rows: [] };
  }

  const groups = new Map<
    string,
    { businessDate: string; pump: number; product: Product; open: number; close: number; n: number }
  >();

  for (const r of aoa.slice(hIdx + 1)) {
    const pump = num(r[iPump]);
    const start = num(r[iStart]);
    const end = num(r[iEnd]);
    if (!pump || (!start && !end)) continue; // trailing/blank rows

    const businessDate = cellDate(r[iWhen]);
    if (!businessDate) continue;

    const p = String(r[iProduct]).trim().toUpperCase();
    const product: Product =
      p === "MS" || p === "HSD" ? p : PUMP_PRODUCT[pump] ?? "MS";

    const key = `${businessDate}|${pump}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { businessDate, pump, product, open: start, close: end, n: 1 });
    } else {
      g.open = Math.min(g.open, start);
      g.close = Math.max(g.close, end);
      g.n++;
    }
  }

  const rows: CrisPumpRow[] = Array.from(groups.values())
    .map((g) => ({
      businessDate: g.businessDate,
      pump: g.pump,
      product: g.product,
      openTotalizer: g.open,
      closeTotalizer: g.close,
      txnCount: g.n,
    }))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.pump - b.pump);

  return { sapCode, roName, fromDate, toDate, rows };
}
