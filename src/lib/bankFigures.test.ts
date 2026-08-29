import { describe, it, expect } from "vitest";
import { sumBankFigures, bankFigureAt, type BankFigureRow } from "./bankFigures";

const row = (
  date: string,
  channel: string,
  amount: number,
  source: string,
): BankFigureRow => ({ businessDate: new Date(`${date}T00:00:00.000Z`), channel, amount, source });

const at = (rows: BankFigureRow[], date: string, channel: string) =>
  bankFigureAt(sumBankFigures(rows), date, channel);

describe("sumBankFigures", () => {
  it("adds up providers on a changeover day", () => {
    // 25 Aug 2026: UPI ran through PhonePe until the switch, Paytm after it, so
    // the day's GPay is both together.
    const f = at(
      [
        row("2026-08-25", "GPAY", 71082.92, "STATEMENT"), // PhonePe credit
        row("2026-08-25", "GPAY", 324000, "PAYTM_REPORT"), // Paytm's own share
      ],
      "2026-08-25",
      "GPAY",
    );
    expect(f?.amount).toBe(395082.92);
    expect(f?.fromReport).toBe(true);
  });

  it("does not count Paytm money twice when the report covers a day", () => {
    // The bank's Paytm settlement credit and the report describe the same
    // money. Adding them would inflate every card day from 7–24 Aug.
    const f = at(
      [
        row("2026-08-20", "POS", 25948.55, "PAYTM_BANK"),
        row("2026-08-20", "POS", 25948.55, "PAYTM_REPORT"),
      ],
      "2026-08-20",
      "POS",
    );
    expect(f?.amount).toBe(25948.55);
  });

  it("still uses the bank's Paytm credit on days the report doesn't cover", () => {
    const rows = [
      row("2026-08-20", "POS", 25948.55, "PAYTM_BANK"),
      row("2026-08-21", "POS", 20636.12, "PAYTM_BANK"),
      row("2026-08-21", "POS", 20636.12, "PAYTM_REPORT"),
    ];
    expect(at(rows, "2026-08-20", "POS")?.amount).toBe(25948.55);
    expect(at(rows, "2026-08-20", "POS")?.fromReport).toBe(false);
    expect(at(rows, "2026-08-21", "POS")?.amount).toBe(20636.12);
  });

  it("drops the bank's Paytm credit for the whole day, both channels", () => {
    // The bank credit is one lump covering UPI and card, so a report for that
    // day supersedes it wherever it landed.
    const rows = [
      row("2026-08-26", "POS", 359124.78, "PAYTM_BANK"),
      row("2026-08-26", "GPAY", 230721.89, "PAYTM_REPORT"),
      row("2026-08-26", "POS", 30296.6, "PAYTM_REPORT"),
    ];
    expect(at(rows, "2026-08-26", "POS")?.amount).toBe(30296.6);
    expect(at(rows, "2026-08-26", "GPAY")?.amount).toBe(230721.89);
  });

  it("adds several statement credits for one day", () => {
    // SBI settled card in more than one BULK POSTING row on catch-up days.
    const f = at(
      [
        row("2026-07-11", "POS", 28494.1, "STATEMENT"),
        row("2026-07-11", "POS", 4497.59, "STATEMENT"),
      ],
      "2026-07-11",
      "POS",
    );
    expect(f?.amount).toBe(32991.69);
  });

  it("keeps days and channels apart", () => {
    const rows = [
      row("2026-08-25", "GPAY", 100, "PAYTM_REPORT"),
      row("2026-08-25", "POS", 200, "PAYTM_REPORT"),
      row("2026-08-26", "GPAY", 300, "PAYTM_REPORT"),
    ];
    expect(at(rows, "2026-08-25", "GPAY")?.amount).toBe(100);
    expect(at(rows, "2026-08-25", "POS")?.amount).toBe(200);
    expect(at(rows, "2026-08-26", "GPAY")?.amount).toBe(300);
  });

  it("reports nothing rather than zero for a day with no figures", () => {
    expect(at([], "2026-08-25", "GPAY")).toBeNull();
    expect(at([row("2026-08-25", "GPAY", 100, "PAYTM_REPORT")], "2026-08-25", "POS")).toBeNull();
  });
});
