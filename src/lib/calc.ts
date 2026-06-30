import { z } from "zod";

/**
 * Authoritative calculation engine for a single shift's daily collection sheet.
 *
 * This module is imported by BOTH the client (for live preview as the employee
 * types) and the server (which recomputes and persists — the client's numbers
 * are never trusted). Keep it pure: no I/O, no Decimal, just numbers in/out.
 *
 * Core formula (confirmed with the dealer):
 *   shortExcess = cashTotal + gpay + pos + expensesTotal + creditTotal
 *                 - oilTotal - fuelExpected
 *   fuelExpected = (gross dispensed - test litres) * rate
 *   > 0  => EXCESS (added to the employee's salary at month end)
 *   < 0  => SHORT  (deducted)
 */

export const PRODUCTS = ["MS", "HSD"] as const;
export type Product = (typeof PRODUCTS)[number];

export const SHIFTS = ["MORNING", "EVENING"] as const;
export type Shift = (typeof SHIFTS)[number];

/** Cash note denominations, highest first (₹). Coins are handled separately. */
export const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

/** Field key used for a denomination's count, e.g. 2000 -> "q2000". */
export type DenomKey = `q${Denomination}`;
export const denomKey = (d: Denomination): DenomKey => `q${d}` as const;

/**
 * Round to 2 decimal places (currency). Nudges by a tiny sign-aware epsilon so
 * values that "should" be x.xx5 but are stored just below (e.g. 10.005 ->
 * 10.00499999…) still round half-up to the intended cent.
 */
export function round2(n: number): number {
  const eps = (n >= 0 ? 1 : -1) * 1e-9;
  return Math.round((n + eps) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Input validation (Zod) — shared by client form and server API
// ---------------------------------------------------------------------------

const money = z.coerce.number().finite().min(0);
// Optional numeric fields default to 0 so partial payloads / blank inputs are valid.
const count = z.coerce.number().int().min(0).default(0);
const reading = z.coerce.number().finite().min(0).default(0);

export const oilLineSchema = z.object({
  name: z.string().trim().min(1, "Oil name required"),
  amount: money.positive(),
});

export const expenseLineSchema = z.object({
  description: z.string().trim().min(1, "Expense description required"),
  amount: money.positive(),
});

export const creditLineSchema = z.object({
  customer: z.string().trim().min(1, "Customer name required"),
  amount: money.positive(),
});

export const entryInputSchema = z
  .object({
    product: z.enum(PRODUCTS),
    rate: z.coerce.number().finite().positive(),

    n1Open: reading,
    n1Close: reading,
    n2Open: reading,
    n2Close: reading,
    testLitres: reading,

    q2000: count,
    q500: count,
    q200: count,
    q100: count,
    q50: count,
    q20: count,
    q10: count,
    q5: count,
    coins: money.default(0),

    gpay: money.default(0),
    pos: money.default(0),

    oilLines: z.array(oilLineSchema).default([]),
    expenseLines: z.array(expenseLineSchema).default([]),
    creditLines: z.array(creditLineSchema).default([]),
  })
  .superRefine((v, ctx) => {
    // Meter difference is taken as an absolute value, so the order of the
    // opening/closing readings does not matter.
    const gross =
      Math.abs(v.n1Close - v.n1Open) + Math.abs(v.n2Close - v.n2Open);
    if (v.testLitres > gross)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["testLitres"],
        message: "Test litres cannot exceed litres dispensed",
      });
  });

export interface OilLine {
  name: string;
  amount: number;
}
export interface ExpenseLine {
  description: string;
  amount: number;
}
export interface CreditLine {
  customer: string;
  amount: number;
}

/** Hand-typed input shape (numbers). `entryInputSchema` validates/coerces raw
 *  form data into this on the server. */
export interface EntryInput {
  product: Product;
  rate: number;
  n1Open: number;
  n1Close: number;
  n2Open: number;
  n2Close: number;
  testLitres: number;
  q2000: number;
  q500: number;
  q200: number;
  q100: number;
  q50: number;
  q20: number;
  q10: number;
  q5: number;
  coins: number;
  gpay: number;
  pos: number;
  oilLines: OilLine[];
  expenseLines: ExpenseLine[];
  creditLines: CreditLine[];
}

/** Parsed/validated output of `entryInputSchema`. */
export type EntryInputParsed = z.output<typeof entryInputSchema>;

/**
 * Loosely-typed shape for live preview: form fields arrive as strings (and may
 * be partially filled). `computeEntry` coerces everything via `num()`.
 */
export type RawEntryInput = Partial<{
  [K in keyof Omit<
    EntryInput,
    "oilLines" | "expenseLines" | "creditLines"
  >]: number | string;
}> & {
  oilLines?: Array<{ name?: string; amount?: number | string }>;
  expenseLines?: Array<{ description?: string; amount?: number | string }>;
  creditLines?: Array<{ customer?: string; amount?: number | string }>;
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export interface EntryComputed {
  grossLitres: number;
  netSalableLitres: number;
  fuelExpected: number;
  cashTotal: number;
  oilTotal: number;
  expensesTotal: number;
  creditTotal: number;
  /** cash + gpay + pos (the money physically/digitally in hand) */
  collected: number;
  /** > 0 excess, < 0 short, 0 balanced */
  shortExcess: number;
}

/** What the result represents, for display. */
export function shortExcessLabel(shortExcess: number): "SHORT" | "EXCESS" | "BALANCED" {
  if (shortExcess > 0) return "EXCESS";
  if (shortExcess < 0) return "SHORT";
  return "BALANCED";
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Compute every derived value from raw inputs. Tolerant of partially-filled
 * forms (missing fields treated as 0) so it can drive a live preview.
 */
export function computeEntry(input: RawEntryInput): EntryComputed {
  const n1Open = num(input.n1Open);
  const n1Close = num(input.n1Close);
  const n2Open = num(input.n2Open);
  const n2Close = num(input.n2Close);
  const testLitres = num(input.testLitres);
  const rate = num(input.rate);

  // Absolute value per nozzle so the reading order doesn't matter.
  const grossLitres = round2(
    Math.abs(n1Close - n1Open) + Math.abs(n2Close - n2Open),
  );
  const netSalableLitres = round2(grossLitres - testLitres);
  const fuelExpected = round2(netSalableLitres * rate);

  const cashTotal = round2(
    2000 * num(input.q2000) +
      500 * num(input.q500) +
      200 * num(input.q200) +
      100 * num(input.q100) +
      50 * num(input.q50) +
      20 * num(input.q20) +
      10 * num(input.q10) +
      5 * num(input.q5) +
      num(input.coins),
  );

  const oilTotal = round2(
    (input.oilLines ?? []).reduce(
      (s, l) => s + num(l.amount),
      0,
    ),
  );
  const expensesTotal = round2(
    (input.expenseLines ?? []).reduce((s, l) => s + num(l.amount), 0),
  );
  const creditTotal = round2(
    (input.creditLines ?? []).reduce((s, l) => s + num(l.amount), 0),
  );

  const gpay = num(input.gpay);
  const pos = num(input.pos);
  const collected = round2(cashTotal + gpay + pos);

  const shortExcess = round2(
    cashTotal + gpay + pos + expensesTotal + creditTotal - oilTotal - fuelExpected,
  );

  return {
    grossLitres,
    netSalableLitres,
    fuelExpected,
    cashTotal,
    oilTotal,
    expensesTotal,
    creditTotal,
    collected,
    shortExcess,
  };
}
