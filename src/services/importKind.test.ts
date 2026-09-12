import { describe, it, expect } from "vitest";
import { detectImportKind } from "./importKind";

// Fabricated shapes only — this repo is public and the real exports carry
// account numbers, customer VPAs and card digits.
const T = "\t";

const statement = [
  `Account Name       :                ${T}Parakkan Petroleum`,
  `Account Number     :${T}_00000011111111111`,
  `Branch             :${T}SOMEWHERE`,
  ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Branch Code", "Debit", "Credit", "Balance", ""].join(T),
  ["13/06/2026", "13/06/2026", "   BY TRANSFER-NEFT*PhonePe Limited*--", "x / ", "4430", " ", "234771.47", "0.00", ""].join(T),
].join("\n");

// The Paytm export puts its ~115 column names on the very first line.
const paytmReport = [
  [
    "Merchant_Name",
    "Transaction_Date",
    "Transaction_ID",
    "Status",
    "Transaction_Type",
    "Amount",
    "Payment_Mode",
    "Settled_Amount",
  ].join(","),
  ["'A Shop'", "'2026-08-28 09:41:52'", "'t1'", "'SUCCESS'", "'ACQUIRING'", "'500'", "'UPI'", "'500'"].join(","),
].join("\n");

describe("detectImportKind", () => {
  it("recognises an SBI statement by the row its parser keys off", () => {
    expect(detectImportKind(statement)).toBe("STATEMENT");
  });

  it("recognises a Paytm report by its header columns", () => {
    expect(detectImportKind(paytmReport)).toBe("PAYTM_REPORT");
  });

  it("takes CRLF line endings either file may arrive with", () => {
    expect(detectImportKind(statement.replace(/\n/g, "\r\n"))).toBe("STATEMENT");
    expect(detectImportKind(paytmReport.replace(/\n/g, "\r\n"))).toBe("PAYTM_REPORT");
  });

  it("refuses to guess at anything else", () => {
    expect(detectImportKind("")).toBeNull();
    expect(detectImportKind("name,amount\nfoo,1\n")).toBeNull();
    // A plain CSV with the wrong columns is unrecognised, not binary.
    expect(detectImportKind("Today Date,Value Date,Amount,Balance,Narration\n01/02/2026,,,,x")).toBeNull();
  });

  it("calls a real spreadsheet binary, so the error can name the right download", () => {
    // SBI also offers an "Account Statement Report" workbook. A modern .xlsx is
    // a zip and a legacy .xls an OLE container; read as UTF-8 both leave NULs
    // or replacement characters near the start.
    const xlsx = `PK${String.fromCharCode(3, 4, 0, 0)}[Content_Types].xml`;
    expect(detectImportKind(xlsx)).toBe("BINARY");
    expect(detectImportKind(`${String.fromCharCode(0xfffd)}\u0000Workbook`)).toBe("BINARY");
  });

  it("is not fooled by the words turning up in a narration", () => {
    // "Txn Date" only counts as the header when it is the whole first cell.
    expect(detectImportKind(["Note", "Txn Date is below"].join(T))).toBeNull();
  });
});
