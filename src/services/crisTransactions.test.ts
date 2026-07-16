import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCrisTransactions, PUMP_PRODUCT } from "./crisTransactions";

/** Excel day serial (days since 1899-12-30) for an ISO date + hour fraction. */
const serial = (iso: string, hour = 0) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000 +
  25569 +
  hour / 24;

const HEADER = [
  "S.no", "Transaction Id", "Transaction Date & Time", "Tank No", "Pump No",
  "Nozzle No", "Product", "Unit Price(Rs.)", "Volume(Ltrs.)", "Amount(Rs.)",
  "Discount Amount", "Net Amount", "Employee Id", "Tag Id",
  "Hos Received Date & Time", "Transaction Type", "Customer Vehicle Number",
  "Customer Mobile Number", "Receipt Printed", "Receipt Number", "Printer No",
  "Start Totalizer", "End Totalizer", "Diff Totalizer",
];

function txn(
  when: number | string,
  pump: number,
  product: string,
  start: number,
  end: number,
): unknown[] {
  const r = new Array(HEADER.length).fill("");
  r[0] = 1;
  r[2] = when;
  r[4] = pump;
  r[6] = product;
  r[21] = start;
  r[22] = end;
  r[23] = Math.round((end - start) * 100) / 100;
  return r;
}

function workbook(dataRows: unknown[][]): Buffer {
  const aoa: unknown[][] = [
    ["", "Transaction Report Details"],
    ["RO SAP Code: ", "41028666", "RO Code: ", "15433620", "RO Name: ", "PARAKKAN PETROLEUM"],
    ["Project Phase: ", "Phase-XII", "Vendor: ", "ORPAK", "From Date: ", "15-07-2026 00:00:00", "To Date: ", "15-07-2026 23:59:59"],
    [],
    [],
    HEADER,
    ...dataRows,
    [], // trailing blank row, as in the real export
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Transactions");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseCrisTransactions", () => {
  it("takes min start / max end per pump regardless of row order", () => {
    const d = "2026-07-15";
    // Reverse-chronological rows (like the real export) for pump 5 (MS).
    const buf = workbook([
      txn(serial(d, 21), 5, "MS", 1591237.85, 1591238.55),
      txn(serial(d, 12), 5, "MS", 1591000.0, 1591237.85),
      txn(serial(d, 6), 5, "MS", 1590396.81, 1591000.0),
    ]);
    const rep = parseCrisTransactions(buf);
    expect(rep.rows).toHaveLength(1);
    expect(rep.rows[0]).toMatchObject({
      businessDate: d,
      pump: 5,
      product: "MS",
      openTotalizer: 1590396.81,
      closeTotalizer: 1591238.55,
      txnCount: 3,
    });
  });

  it("groups by pump and date, sorts, and reads report metadata", () => {
    const d1 = "2026-07-14";
    const d2 = "2026-07-15";
    const buf = workbook([
      txn(serial(d2, 8), 1, "HSD", 2000, 2010),
      txn(serial(d1, 20), 1, "HSD", 1980, 2000),
      txn(serial(d2, 9), 3, "MS", 500, 520),
    ]);
    const rep = parseCrisTransactions(buf);
    expect(rep.sapCode).toBe("41028666");
    expect(rep.roName).toBe("PARAKKAN PETROLEUM");
    expect(rep.rows.map((r) => `${r.businessDate}|${r.pump}`)).toEqual([
      `${d1}|1`,
      `${d2}|1`,
      `${d2}|3`,
    ]);
    expect(rep.rows[0]).toMatchObject({ openTotalizer: 1980, closeTotalizer: 2000, product: "HSD" });
    expect(rep.rows[1]).toMatchObject({ openTotalizer: 2000, closeTotalizer: 2010 });
  });

  it("falls back to the pump→product map when the product cell is junk", () => {
    const d = "2026-07-15";
    const buf = workbook([
      txn(serial(d, 10), 2, "", 100, 110),
      txn(serial(d, 10), 6, "??", 300, 330),
    ]);
    const rep = parseCrisTransactions(buf);
    expect(rep.rows.find((r) => r.pump === 2)?.product).toBe("HSD");
    expect(rep.rows.find((r) => r.pump === 6)?.product).toBe("MS");
    expect(PUMP_PRODUCT[2]).toBe("HSD");
  });

  it("handles string timestamps and skips blank/malformed rows", () => {
    const buf = workbook([
      txn("15-07-2026 14:23:11", 4, "MS", 700, 715),
      txn("garbage-date", 4, "MS", 715, 720), // dropped: unparseable date
    ]);
    const rep = parseCrisTransactions(buf);
    expect(rep.rows).toHaveLength(1);
    expect(rep.rows[0]).toMatchObject({
      businessDate: "2026-07-15",
      pump: 4,
      openTotalizer: 700,
      closeTotalizer: 715,
      txnCount: 1,
    });
  });

  it("returns no rows for a workbook without the expected header", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["nothing"]]), "Transactions");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(parseCrisTransactions(buf).rows).toEqual([]);
  });
});
