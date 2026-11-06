import { prisma } from "@/lib/db";
import { entryInputSchema, computeEntry } from "@/lib/calc";
import { toNum } from "@/lib/format";

/**
 * Changes a few measured fields on a filed sheet without resubmitting it, then
 * re-runs the authoritative calc and logs every change.
 *
 * Meter readings and pump-test litres both feed `netSalableLitres`, so touching
 * either moves the sheet's fuel value and its short/excess. That makes a
 * "small" correction exactly as consequential as a full edit, and it has to go
 * through the same engine and the same audit trail — which is why both the
 * Meter tab's quick-fix and the Summary tab's test-litres editor come through
 * here rather than writing columns of their own.
 */

/** The fields a quick patch may touch. Everything else needs a full edit. */
export type QuickPatch = Partial<{
  n1Open: number;
  n1Close: number;
  n2Open: number;
  n2Close: number;
  testLitres: number;
}>;

const READING_FIELDS = ["n1Open", "n1Close", "n2Open", "n2Close"] as const;
const PATCHABLE = [...READING_FIELDS, "testLitres"] as const;

export type QuickPatchResult =
  | { ok: true; changes: number }
  | { ok: false; status: number; error: string };

export async function applyQuickPatch(
  id: number,
  patch: QuickPatch,
  userId: number,
): Promise<QuickPatchResult> {
  const existing = await prisma.dailyEntry.findUnique({
    where: { id },
    include: { oilLines: true, expenseLines: true, salaryLines: true, creditLines: true },
  });
  if (!existing) return { ok: false, status: 404, error: "Not found" };

  const values: Record<string, number> = {
    n1Open: toNum(existing.n1Open),
    n1Close: toNum(existing.n1Close),
    n2Open: toNum(existing.n2Open),
    n2Close: toNum(existing.n2Close),
    testLitres: toNum(existing.testLitres),
  };
  for (const f of PATCHABLE) {
    const v = patch[f];
    if (v !== undefined) values[f] = v;
  }

  // A totalizer is never 0, and the schema's swap-normalization would turn a
  // half-filled pair (one reading 0) into a whole-totalizer litre figure. So a
  // touched nozzle must come out with both readings or neither.
  for (const [a, b] of [
    ["n1Open", "n1Close"],
    ["n2Open", "n2Close"],
  ] as const) {
    if (patch[a] === undefined && patch[b] === undefined) continue;
    if ((values[a] === 0) !== (values[b] === 0)) {
      return {
        ok: false,
        status: 400,
        error:
          "The nozzle's other reading is still empty — this fix would corrupt the litres. " +
          "Fill both readings (open the sheet and edit it) instead.",
      };
    }
  }

  // Rebuild the sheet's input with the new values, then reuse the shared schema
  // (which normalizes opening < closing and rejects test litres above the
  // litres dispensed) and the calc engine.
  const parsed = entryInputSchema.safeParse({
    product: existing.product,
    rate: toNum(existing.rate),
    ...values,
    q2000: existing.q2000,
    q500: existing.q500,
    q200: existing.q200,
    q100: existing.q100,
    q50: existing.q50,
    q20: existing.q20,
    q10: existing.q10,
    q5: existing.q5,
    coins: toNum(existing.coins),
    gpay: toNum(existing.gpay),
    pos: toNum(existing.pos),
    oilLines: existing.oilLines.map((l) => ({ name: l.name, amount: toNum(l.amount) })),
    expenseLines: existing.expenseLines.map((l) => ({
      description: l.description,
      amount: toNum(l.amount),
    })),
    salaryLines: existing.salaryLines.map((l) => ({
      description: l.description,
      amount: toNum(l.amount),
    })),
    creditLines: existing.creditLines.map((l) => ({
      customer: l.customer,
      amount: toNum(l.amount),
    })),
  });
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      // The schema's own wording is the useful part ("Test litres cannot exceed
      // litres dispensed"), so pass it through rather than a generic message.
      error: parsed.error.issues[0]?.message ?? "That value doesn't fit this sheet.",
    };
  }
  const input = parsed.data;
  const c = computeEntry(input);

  const audits: { field: string; oldValue: string; newValue: string }[] = [];
  const cmpNum = (field: string, oldV: unknown, newV: number) => {
    const o = toNum(oldV);
    if (o !== newV) audits.push({ field, oldValue: String(o), newValue: String(newV) });
  };
  cmpNum("n1Open", existing.n1Open, input.n1Open);
  cmpNum("n1Close", existing.n1Close, input.n1Close);
  cmpNum("n2Open", existing.n2Open, input.n2Open);
  cmpNum("n2Close", existing.n2Close, input.n2Close);
  cmpNum("testLitres", existing.testLitres, input.testLitres);
  cmpNum("fuelExpected", existing.fuelExpected, c.fuelExpected);
  cmpNum("shortExcess", existing.shortExcess, c.shortExcess);

  if (audits.length === 0) return { ok: true, changes: 0 };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.dailyEntry.update({
        where: { id },
        data: {
          n1Open: input.n1Open,
          n1Close: input.n1Close,
          n2Open: input.n2Open,
          n2Close: input.n2Close,
          testLitres: input.testLitres,
          grossLitres: c.grossLitres,
          netSalableLitres: c.netSalableLitres,
          fuelExpected: c.fuelExpected,
          shortExcess: c.shortExcess,
        },
      });
      await tx.entryAudit.createMany({
        data: audits.map((a) => ({ entryId: id, changedById: userId, ...a })),
      });
    });
    return { ok: true, changes: audits.length };
  } catch (err) {
    console.error("Failed to apply quick patch", err);
    return { ok: false, status: 500, error: "Could not save the change" };
  }
}
