import * as XLSX from "xlsx";

/**
 * Parser for the CRIS "Daily Sales Report" .xlsx (sheet "Daily Sales Summary").
 * Extracts, per business date and product, the **Net Totalizer Sales (Ltrs.)** —
 * the official salable quantity (totalizer minus testing) — to reconcile against
 * the net salable litres staff enter from their meter readings.
 */

export type Product = "MS" | "HSD";

export interface CrisRow {
  businessDate: string; // YYYY-MM-DD (IST calendar date)
  product: Product;
  netTotalizerLitres: number;
  testLitres: number;
  totalizerLitres: number;
}

export interface CrisReport {
  sapCode?: string;
  roName?: string;
  fromDate?: string;
  toDate?: string;
  rows: CrisRow[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Convert a sheet "Date" cell to its IST calendar date (YYYY-MM-DD). */
export function toISTDate(v: unknown): string | null {
  if (v instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(v);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})/); // DD-MM-YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // already ISO-ish
  if (m) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

export function parseCrisReport(buf: Buffer | ArrayBuffer): CrisReport {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets["Daily Sales Summary"] ?? wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  // Metadata is scattered as "Label: ", value pairs in the first rows.
  let sapCode: string | undefined,
    roName: string | undefined,
    fromDate: string | undefined,
    toDate: string | undefined;
  for (const r of aoa.slice(0, 4)) {
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
  const iProduct = find(/^product$/i);
  const iDate = find(/^date$/i);
  const iNet = find(/net totalizer sales/i);
  const iTest = find(/testing summary/i);
  const iTot = find(/totalizer sales quantity/i);

  const rows: CrisRow[] = [];
  for (const r of aoa.slice(hIdx + 1)) {
    const product = String(r[iProduct]).trim().toUpperCase();
    if (product !== "MS" && product !== "HSD") continue;
    const businessDate = toISTDate(r[iDate]);
    if (!businessDate) continue;
    rows.push({
      businessDate,
      product,
      netTotalizerLitres: num(r[iNet]),
      testLitres: num(r[iTest]),
      totalizerLitres: num(r[iTot]),
    });
  }

  return { sapCode, roName, fromDate, toDate, rows };
}
