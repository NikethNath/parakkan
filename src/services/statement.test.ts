import { describe, it, expect } from "vitest";
import { parseStatement, classify } from "./statement";

const T = "\t";
function row(
  txnDate: string,
  desc: string,
  ref: string,
  branch: string,
  debit: string,
  credit: string,
) {
  return [txnDate, txnDate, desc, ref, branch, debit, credit, "0.00", ""].join(T);
}

const sample = [
  `Account Number${T}_00000040416634074`,
  `Name${T}PARAKKAN PETROLEUM`,
  ["Txn Date", "Value Date", "Description", "Ref", "Branch", "Debit", "Credit", "Balance", ""].join(T),
  // GPay (PhonePe) — T+1: 13 Jun posting = 12 Jun collection
  row("13/06/2026", "   BY TRANSFER-NEFT*YESB0000001*YESAP61641609940*PhonePe Limited*--", "TRANSFER FROM 99509044300 / ", "4430", " ", "234771.47"),
  // GPay — 12 Jun posting = 11 Jun collection
  row("12/06/2026", "   BY TRANSFER-NEFT*YESB0000001*YESAP61634182486*PhonePe Limited*--", "TRANSFER FROM 99509044300 / ", "4430", " ", "182420.04"),
  // POS — DDMM 1106 = 11 Jun (posted 12 Jun)
  row("12/06/2026", "   BULK POSTING-SBIP_CR_PARAKKAN PETROLEUM    022000000318564 1106--", " / ", "16899", " ", "28494.10"),
  // POS — DDMM 3005 = 30 May (posted 1 Jun, previous month)
  row("01/06/2026", "   BULK POSTING-SBIP_CR_PARAKKAN PETROLEUM    022000000318564 3005--", " / ", "16899", " ", "25331.55"),
  // POS — DDMM 3112 = 31 Dec, posted 2 Jan 2027 (year rollover)
  row("02/01/2027", "   BULK POSTING-SBIP_CR_PARAKKAN PETROLEUM    022000000318564 3112--", " / ", "16899", " ", "9999.00"),
  // Debit: HPCL EDFS sweep (no credit) — excluded
  row("06/06/2026", "   TO TRANSFER-INB Edfs--", "CIAANICCX9 / ", "99922", "483000.00", " "),
  // Debit: POS rent fee — excluded
  row("04/06/2026", "   DEBIT-_202606_Pos Rent for TID-KL056953--", " / ", "16899", "824.82", " "),
  // Other credit (e.g. random NEFT) — counted as skippedOther
  row("07/06/2026", "   BY TRANSFER-NEFT*SOMEONE ELSE*--", "x / ", "1234", " ", "5000.00"),
].join("\n");

describe("classify", () => {
  it("detects channels", () => {
    expect(classify("BY TRANSFER-NEFT*...*PhonePe Limited*--")).toBe("GPAY");
    expect(classify("BULK POSTING-SBIP_CR_PARAKKAN PETROLEUM 022000000318564 1106--")).toBe("POS");
    expect(classify("TO TRANSFER-INB Edfs--")).toBe("OTHER");
  });
});

describe("parseStatement", () => {
  const r = parseStatement(sample);

  it("reads the account number", () => {
    expect(r.accountNumber).toBe("00000040416634074");
  });

  it("keeps only GPay and POS credits", () => {
    expect(r.txns).toHaveLength(5);
    expect(r.skippedOther).toBe(1); // the random NEFT credit
  });

  it("maps GPay with T+1 (business date = posting date − 1)", () => {
    const g = r.txns.filter((t) => t.channel === "GPAY");
    expect(g.find((t) => t.businessDate === "2026-06-12")?.amount).toBe(234771.47);
    expect(g.find((t) => t.businessDate === "2026-06-11")?.amount).toBe(182420.04);
  });

  it("maps POS using the DDMM tail as the business date", () => {
    const p = r.txns.filter((t) => t.channel === "POS");
    expect(p.find((t) => t.businessDate === "2026-06-11")?.amount).toBe(28494.1);
    expect(p.find((t) => t.businessDate === "2026-05-30")?.amount).toBe(25331.55);
  });

  it("handles the Dec→Jan year rollover for POS DDMM", () => {
    const p = r.txns.find((t) => t.amount === 9999);
    expect(p?.businessDate).toBe("2026-12-31");
  });
});
