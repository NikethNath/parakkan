import { describe, it, expect } from "vitest";
import { parsePaytmReport, classifyPaytmMode } from "./paytmReport";

// Shaped like the real Paytm for Business export: values wrapped in a literal
// apostrophe, and far more columns than are used. Every identifier is made up —
// the real file carries customer VPAs and card digits and is never committed.
const HEADER = [
  "Transaction_ID", "Transaction_Date", "Transaction_Type", "Status", "Merchant_Name",
  "Amount", "Payment_Mode", "Customer_VPA",
].join(",");

const row = (
  date: string,
  status: string,
  amount: string,
  mode: string,
  type = "ACQUIRING",
) => [`"'txn'"`, `'${date}'`, `'${type}'`, `'${status}'`, "'Some Outlet'", amount, `'${mode}'`, "'someone@bank'"].join(",");

const sample = [
  HEADER,
  row("2026-08-28 09:41:52", "SUCCESS", "400.00", "UPI"),
  row("2026-08-28 09:39:48", "SUCCESS", "150.00", "UPI"),
  // A RuPay credit card paid over UPI — the customer scanned the QR, so this is
  // GPay money, not a swipe on the card machine.
  row("2026-08-28 10:02:11", "SUCCESS", "500.00", "UPI_CREDIT_CARD"),
  row("2026-08-28 10:10:00", "SUCCESS", "60.00", "UPI_LITE"),
  row("2026-08-28 10:12:00", "SUCCESS", "40.00", "UPI_PPIWALLET"),
  row("2026-08-28 09:38:20", "SUCCESS", "1000.00", "DEBIT_CARD"),
  row("2026-08-28 11:00:00", "SUCCESS", "2000.00", "CREDIT_CARD"),
  // Not money taken.
  row("2026-08-28 09:38:12", "ABORTED", "1000.00", ""),
  row("2026-08-28 12:00:00", "FAILURE", "700.00", "UPI"),
  // A different collection day.
  row("2026-08-29 08:00:00", "SUCCESS", "250.00", "UPI"),
  row("2026-08-29 08:30:00", "SUCCESS", "750.00", "DEBIT_CARD"),
].join("\n");

describe("classifyPaytmMode", () => {
  it("treats UPI and every UPI variant as GPay", () => {
    for (const m of ["UPI", "UPI_LITE", "UPI_PPIWALLET", "UPI_CREDIT_CARD", "'upi'"]) {
      expect(classifyPaytmMode(m)).toBe("GPAY");
    }
  });

  it("treats card payments as POS", () => {
    expect(classifyPaytmMode("DEBIT_CARD")).toBe("POS");
    expect(classifyPaytmMode("CREDIT_CARD")).toBe("POS");
  });

  it("refuses to guess at anything else", () => {
    expect(classifyPaytmMode("")).toBeNull();
    expect(classifyPaytmMode("NET_BANKING")).toBeNull();
  });
});

describe("parsePaytmReport", () => {
  const r = parsePaytmReport(sample);

  it("totals each collection day separately", () => {
    expect(r.days.map((d) => d.date)).toEqual(["2026-08-28", "2026-08-29"]);
  });

  it("sums UPI and its variants into GPay", () => {
    // 400 + 150 + 500 (UPI credit card) + 60 (lite) + 40 (wallet)
    expect(r.days[0].gpay).toBe(1150);
    expect(r.days[0].gpayCount).toBe(5);
  });

  it("sums card payments into POS", () => {
    expect(r.days[0].pos).toBe(3000);
    expect(r.days[0].posCount).toBe(2);
  });

  it("leaves out anything that isn't money taken", () => {
    expect(r.skippedRows).toBe(2); // the aborted and the failed one
    expect(r.countedRows).toBe(9);
  });

  it("keeps a second day's figures apart", () => {
    expect(r.days[1]).toMatchObject({ date: "2026-08-29", gpay: 250, pos: 750 });
  });

  it("reports payment modes it cannot classify instead of dropping them quietly", () => {
    const odd = parsePaytmReport([HEADER, row("2026-08-28 09:00:00", "SUCCESS", "99.00", "NET_BANKING")].join("\n"));
    expect(odd.unknownModes).toEqual(["NET_BANKING"]);
    expect(odd.unknownModeRows).toBe(1);
    expect(odd.days).toHaveLength(0);
  });

  it("ignores refunds and other non-collection rows", () => {
    const withRefund = parsePaytmReport(
      [HEADER, row("2026-08-28 09:00:00", "SUCCESS", "99.00", "UPI", "REFUND")].join("\n"),
    );
    expect(withRefund.days).toHaveLength(0);
    expect(withRefund.skippedRows).toBe(1);
  });

  it("survives an empty or wrong file without throwing", () => {
    expect(parsePaytmReport("").days).toHaveLength(0);
    expect(parsePaytmReport("a,b,c\n1,2,3").days).toHaveLength(0);
  });
});
