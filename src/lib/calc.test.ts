import { describe, it, expect } from "vitest";
import {
  computeEntry,
  entryInputSchema,
  shortExcessLabel,
  round2,
  type EntryInput,
} from "./calc";

// A fully worked MS shift used as the canonical example. Hand-calculated:
//   gross   = (1500-1000) + (2300-2000) = 800 L
//   net     = 800 - 10 = 790 L
//   fuelExp = 790 * 100 = 79,000
//   cash    = 100*500 + 50*200 + 20*100 = 50,000 + 10,000 + 2,000 = 62,000
//   oil     = 2 * 500 = 1,000
//   short/excess = 62,000 + 10,000(gpay) + 5,000(pos) + 200(exp) + 3,000(credit)
//                  - 1,000(oil) - 79,000(fuelExp) = +200  => EXCESS
const base: EntryInput = {
  product: "MS",
  rate: 100,
  n1Open: 1000,
  n1Close: 1500,
  n2Open: 2000,
  n2Close: 2300,
  testLitres: 10,
  q2000: 0,
  q500: 100,
  q200: 50,
  q100: 20,
  q50: 0,
  q20: 0,
  q10: 0,
  q5: 0,
  coins: 0,
  gpay: 10000,
  pos: 5000,
  oilLines: [{ name: "HP Racer4 1L", amount: 1000 }],
  expenseLines: [{ description: "Tea", amount: 200 }],
  creditLines: [{ customer: "Ravi Lorry", amount: 3000 }],
};

describe("computeEntry", () => {
  it("computes the canonical worked example (excess of 200)", () => {
    const r = computeEntry(base);
    expect(r.grossLitres).toBe(800);
    expect(r.netSalableLitres).toBe(790);
    expect(r.fuelExpected).toBe(79000);
    expect(r.cashTotal).toBe(62000);
    expect(r.oilTotal).toBe(1000);
    expect(r.expensesTotal).toBe(200);
    expect(r.creditTotal).toBe(3000);
    expect(r.collected).toBe(77000); // cash + gpay + pos
    expect(r.shortExcess).toBe(200);
    expect(shortExcessLabel(r.shortExcess)).toBe("EXCESS");
  });

  it("goes short when collections fall below expected", () => {
    // drop gpay by 1,000 -> short/excess becomes -800
    const r = computeEntry({ ...base, gpay: 9000 });
    expect(r.shortExcess).toBe(-800);
    expect(shortExcessLabel(r.shortExcess)).toBe("SHORT");
  });

  it("subtracts oil from the fuel reconciliation", () => {
    const withOil = computeEntry(base).shortExcess;
    const withoutOil = computeEntry({ ...base, oilLines: [] }).shortExcess;
    // removing 1,000 of oil from the collections side raises short/excess by 1,000
    expect(withoutOil - withOil).toBe(1000);
  });

  it("adds credit (khata) to the accounted side", () => {
    const withCredit = computeEntry(base).shortExcess;
    const withoutCredit = computeEntry({ ...base, creditLines: [] }).shortExcess;
    expect(withCredit - withoutCredit).toBe(3000);
  });

  it("adds salary / advances paid out, like an expense", () => {
    const baseSE = computeEntry(base).shortExcess;
    const withSalary = computeEntry({
      ...base,
      salaryLines: [{ description: "Advance to Ramesh", amount: 1500 }],
    });
    expect(withSalary.salaryTotal).toBe(1500);
    // money left the till but is accounted for -> raises short/excess by 1,500
    expect(withSalary.shortExcess - baseSE).toBe(1500);
  });

  it("uses the absolute value of each nozzle's difference", () => {
    // swap opening/closing on nozzle 1 -> same 500 L via abs
    const swapped = computeEntry({ ...base, n1Open: 1500, n1Close: 1000 });
    expect(swapped.grossLitres).toBe(800);
    expect(swapped.shortExcess).toBe(computeEntry(base).shortExcess);
  });

  it("subtracts test litres from the salable quantity", () => {
    const withTest = computeEntry(base);
    const noTest = computeEntry({ ...base, testLitres: 0 });
    expect(noTest.netSalableLitres - withTest.netSalableLitres).toBe(10);
    // 10 more salable litres * 100 rate = 1,000 more expected -> 1,000 lower excess
    expect(withTest.shortExcess - noTest.shortExcess).toBe(1000);
  });

  it("treats missing fields as zero for live preview", () => {
    const r = computeEntry({ product: "HSD", rate: 90 });
    expect(r.grossLitres).toBe(0);
    expect(r.fuelExpected).toBe(0);
    expect(r.shortExcess).toBe(0);
    expect(shortExcessLabel(r.shortExcess)).toBe("BALANCED");
  });

  it("rounds money to 2 decimals", () => {
    const r = computeEntry({
      ...base,
      rate: 100.555,
      testLitres: 0,
      n1Close: 1000.1,
      n1Open: 1000,
      n2Close: 2000,
      n2Open: 2000,
    });
    // gross 0.1 L * 100.555 = 10.0555 -> 10.06
    expect(r.fuelExpected).toBe(10.06);
  });
});

describe("round2", () => {
  it("rounds half up at the cent", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe("entryInputSchema validation", () => {
  it("accepts the canonical example", () => {
    expect(entryInputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a closing reading below opening (absolute difference)", () => {
    const r = entryInputSchema.safeParse({ ...base, n1Open: 1500, n1Close: 1000 });
    expect(r.success).toBe(true);
  });

  it("rejects test litres exceeding litres dispensed", () => {
    const r = entryInputSchema.safeParse({ ...base, testLitres: 10000 });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive rate", () => {
    const r = entryInputSchema.safeParse({ ...base, rate: 0 });
    expect(r.success).toBe(false);
  });

  it("defaults missing optional numeric fields to 0", () => {
    const r = entryInputSchema.safeParse({
      product: "MS",
      rate: 100,
      n1Open: 1000,
      n1Close: 1500,
      n2Open: 2000,
      n2Close: 2300,
      // no denominations, coins, gpay, pos, testLitres, or line arrays
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.q2000).toBe(0);
      expect(r.data.coins).toBe(0);
      expect(r.data.gpay).toBe(0);
      expect(r.data.testLitres).toBe(0);
      expect(r.data.oilLines).toEqual([]);
    }
  });

  it("coerces numeric strings (form inputs arrive as strings)", () => {
    const r = entryInputSchema.safeParse({
      ...base,
      rate: "100",
      n1Close: "1500",
      q500: "100",
    });
    expect(r.success).toBe(true);
  });
});
