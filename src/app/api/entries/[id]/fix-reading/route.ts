import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { entryInputSchema, computeEntry } from "@/lib/calc";
import { toNum } from "@/lib/format";

const fieldEnum = z.enum(["n1Open", "n1Close", "n2Open", "n2Close"]);
const bodySchema = z.object({
  // One write replaces a wrong reading; two writes fill a blank nozzle pair.
  fields: z
    .array(z.object({ field: fieldEnum, value: z.coerce.number().finite().min(0) }))
    .min(1)
    .max(2)
    .refine((fs) => new Set(fs.map((f) => f.field)).size === fs.length, "Duplicate field"),
});

/**
 * Quick-fix for meter readings (used by the Meter tab): replace a staff
 * reading that disagrees with the official CRIS totalizer, or fill a missing
 * nozzle pair from it. Re-runs the authoritative calc and logs every change in
 * the audit trail — same rules as a full admin edit, without resubmitting the
 * whole sheet.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const writes = body.data.fields;

  const existing = await prisma.dailyEntry.findUnique({
    where: { id },
    include: {
      oilLines: true,
      expenseLines: true,
      salaryLines: true,
      creditLines: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const readings: Record<string, number> = {
    n1Open: toNum(existing.n1Open),
    n1Close: toNum(existing.n1Close),
    n2Open: toNum(existing.n2Open),
    n2Close: toNum(existing.n2Close),
  };
  for (const w of writes) readings[w.field] = w.value;

  // A totalizer is never 0, and the schema's swap-normalization would turn a
  // half-filled pair (one reading 0) into a whole-totalizer litre figure. So a
  // touched nozzle must come out with both readings or neither.
  for (const [a, b] of [["n1Open", "n1Close"], ["n2Open", "n2Close"]] as const) {
    if (!writes.some((w) => w.field === a || w.field === b)) continue;
    if ((readings[a] === 0) !== (readings[b] === 0)) {
      return NextResponse.json(
        {
          error:
            "The nozzle's other reading is still empty — this fix would corrupt the litres. " +
            "Fill both readings (open the sheet and edit it) instead.",
        },
        { status: 400 },
      );
    }
  }

  // Rebuild the sheet's input with the reading(s) replaced, then reuse the
  // shared schema (normalizes opening < closing) and calc engine.
  const parsed = entryInputSchema.safeParse({
    product: existing.product,
    rate: toNum(existing.rate),
    ...readings,
    testLitres: toNum(existing.testLitres),
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
    return NextResponse.json(
      { error: "The CRIS value doesn't fit this sheet (validation failed)." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const c = computeEntry(input);

  const audits: { field: string; oldValue: string; newValue: string }[] = [];
  const cmpNum = (f: string, oldV: unknown, newV: number) => {
    const o = toNum(oldV);
    if (o !== newV) audits.push({ field: f, oldValue: String(o), newValue: String(newV) });
  };
  cmpNum("n1Open", existing.n1Open, input.n1Open);
  cmpNum("n1Close", existing.n1Close, input.n1Close);
  cmpNum("n2Open", existing.n2Open, input.n2Open);
  cmpNum("n2Close", existing.n2Close, input.n2Close);
  cmpNum("fuelExpected", existing.fuelExpected, c.fuelExpected);
  cmpNum("shortExcess", existing.shortExcess, c.shortExcess);

  if (audits.length === 0) {
    return NextResponse.json({ ok: true, id, changes: 0 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.dailyEntry.update({
        where: { id },
        data: {
          n1Open: input.n1Open,
          n1Close: input.n1Close,
          n2Open: input.n2Open,
          n2Close: input.n2Close,
          grossLitres: c.grossLitres,
          netSalableLitres: c.netSalableLitres,
          fuelExpected: c.fuelExpected,
          shortExcess: c.shortExcess,
        },
      });
      await tx.entryAudit.createMany({
        data: audits.map((a) => ({ entryId: id, changedById: user.uid, ...a })),
      });
    });
    return NextResponse.json({ ok: true, id, changes: audits.length });
  } catch (err) {
    console.error("Failed to quick-fix reading", err);
    return NextResponse.json({ error: "Could not save the fix" }, { status: 500 });
  }
}
