import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCrisReport, toISTDate } from "./crisReport";

function buildXlsx(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daily Sales Summary");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const header = [
  "S.no",
  "Product",
  "Date",
  "Opening Stock (Ltrs.)",
  "Receipt Quantity (Ltrs.)",
  "Total Stock (Ltrs.)",
  "Closing Stock (Ltrs.)",
  "Tank Sales Quantity(Ltrs.) Summary",
  "Totalizer Sales Quantity (Ltrs.) Summary",
  "Testing Summary (Ltrs.)",
  "Net Totalizer Sales (Ltrs.)",
  "Cumulative Sales (Ltrs.)",
  "Loss/Gain (Ltrs.)",
  "Cumulative Loss/Gain (Ltrs.)",
];

const aoa: unknown[][] = [
  ["", "Daily Sales Report"],
  ["RO SAP Code: ", "41028666", "RO Name: ", "PARAKKAN PETROLEUM"],
  ["From Date: ", "01-06-2026 00:00:00", "To Date: ", "02-06-2026 23:59:59", "Product: ", "MS,HSD"],
  header,
  [1, "HSD", "01-06-2026", 14824.6, 0, 14824.6, 11138.2, 3686.4, 3679.84, 10, 3669.84, 3669.84, -16.56, -16.56],
  [2, "MS", "01-06-2026", 5000, 0, 5000, 4000, 1000, 1005, 5, 1000, 1000, 5, 5],
  [3, "HSD", "02-06-2026", 11138.2, 4000, 15138.2, 12756.1, 2382.1, 2386.3, 10, 2376.3, 6046.14, -5.8, -22.36],
  ["Grand Total", "", "", "", "", "", "", "", "", "", "", "", "", ""],
];

describe("parseCrisReport", () => {
  const r = parseCrisReport(buildXlsx(aoa));

  it("reads RO metadata", () => {
    expect(r.sapCode).toBe("41028666");
    expect(r.roName).toBe("PARAKKAN PETROLEUM");
  });

  it("extracts Net Totalizer Sales per product/date", () => {
    expect(r.rows).toHaveLength(3);
    const hsd1 = r.rows.find((x) => x.product === "HSD" && x.businessDate === "2026-06-01");
    expect(hsd1?.netTotalizerLitres).toBe(3669.84);
    expect(hsd1?.testLitres).toBe(10);
    expect(hsd1?.totalizerLitres).toBe(3679.84);
    const ms1 = r.rows.find((x) => x.product === "MS" && x.businessDate === "2026-06-01");
    expect(ms1?.netTotalizerLitres).toBe(1000);
  });

  it("keeps only MS/HSD rows (skips totals/footers)", () => {
    expect(r.rows.every((x) => x.product === "MS" || x.product === "HSD")).toBe(true);
  });

  it("converts a UTC Date cell to its IST calendar date", () => {
    // 2026-05-31T18:30:00Z == 2026-06-01 00:00 IST (how CRIS dates arrive)
    expect(toISTDate(new Date("2026-05-31T18:30:00.000Z"))).toBe("2026-06-01");
    expect(toISTDate("22-06-2026 00:00:00")).toBe("2026-06-22");
  });
});
