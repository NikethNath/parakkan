import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { entryInputSchema, computeEntry, SHIFTS } from "@/lib/calc";
import { toNum, isoDate } from "@/lib/format";

const metaSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(SHIFTS),
  verify: z.boolean().optional(),
});

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Raw input fields compared for the audit trail.
const INPUT_FIELDS = [
  "rate",
  "n1Open",
  "n1Close",
  "n2Open",
  "n2Close",
  "testLitres",
  "q2000",
  "q500",
  "q200",
  "q100",
  "q50",
  "q20",
  "q10",
  "q5",
  "coins",
  "gpay",
  "pos",
] as const;

export async function DELETE(
  _req: Request,
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

  const existing = await prisma.dailyEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Cascades to oil/expense/credit lines and the audit trail.
      await tx.dailyEntry.delete({ where: { id } });
      // Drop the attendance this submission auto-marked, so a test/bogus entry
      // doesn't leave the staff counted "present" — unless another submission by
      // the same employee still covers that day/shift. A manual mark is left alone.
      const stillCovered = await tx.dailyEntry.count({
        where: {
          employeeId: existing.employeeId,
          businessDate: existing.businessDate,
          shift: existing.shift,
        },
      });
      if (stillCovered === 0) {
        await tx.attendance.deleteMany({
          where: {
            employeeId: existing.employeeId,
            date: existing.businessDate,
            shift: existing.shift,
            source: "AUTO",
          },
        });
      }
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("Failed to delete entry", err);
    return NextResponse.json({ error: "Could not delete submission" }, { status: 500 });
  }
}

export async function PATCH(
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

  const existing = await prisma.dailyEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const meta = metaSchema.safeParse(body);
  const entry = entryInputSchema.safeParse(body);
  if (!meta.success || !entry.success) {
    const issues = [
      ...(meta.success ? [] : meta.error.issues),
      ...(entry.success ? [] : entry.error.issues),
    ].map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
  }

  const input = entry.data;
  const c = computeEntry(input);

  // --- Build the audit diff (employee-original values are preserved) ---------
  const audits: { field: string; oldValue: string; newValue: string }[] = [];
  const ex = existing as unknown as Record<string, unknown>;
  const inp = input as unknown as Record<string, number>;

  const cmpNum = (field: string, oldV: unknown, newV: number) => {
    const o = toNum(oldV);
    if (o !== newV) audits.push({ field, oldValue: String(o), newValue: String(newV) });
  };
  const cmpStr = (field: string, oldV: string, newV: string) => {
    if (oldV !== newV) audits.push({ field, oldValue: oldV, newValue: newV });
  };

  cmpStr("businessDate", isoDate(existing.businessDate), meta.data.businessDate);
  cmpStr("shift", existing.shift, meta.data.shift);
  cmpStr("product", existing.product, input.product);
  for (const f of INPUT_FIELDS) cmpNum(f, ex[f], inp[f]);
  cmpNum("cashTotal", existing.cashTotal, c.cashTotal);
  cmpNum("oilTotal", existing.oilTotal, c.oilTotal);
  cmpNum("expensesTotal", existing.expensesTotal, c.expensesTotal);
  cmpNum("creditTotal", existing.creditTotal, c.creditTotal);
  cmpNum("fuelExpected", existing.fuelExpected, c.fuelExpected);
  cmpNum("shortExcess", existing.shortExcess, c.shortExcess);

  const verify = meta.data.verify ?? existing.status === "VERIFIED";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.oilLine.deleteMany({ where: { entryId: id } });
      await tx.expenseLine.deleteMany({ where: { entryId: id } });
      await tx.creditLine.deleteMany({ where: { entryId: id } });

      await tx.dailyEntry.update({
        where: { id },
        data: {
          businessDate: toDate(meta.data.businessDate),
          shift: meta.data.shift,
          product: input.product,
          rate: input.rate,
          n1Open: input.n1Open,
          n1Close: input.n1Close,
          n2Open: input.n2Open,
          n2Close: input.n2Close,
          testLitres: input.testLitres,
          q2000: input.q2000,
          q500: input.q500,
          q200: input.q200,
          q100: input.q100,
          q50: input.q50,
          q20: input.q20,
          q10: input.q10,
          q5: input.q5,
          coins: input.coins,
          gpay: input.gpay,
          pos: input.pos,
          cashTotal: c.cashTotal,
          oilTotal: c.oilTotal,
          expensesTotal: c.expensesTotal,
          creditTotal: c.creditTotal,
          grossLitres: c.grossLitres,
          netSalableLitres: c.netSalableLitres,
          fuelExpected: c.fuelExpected,
          shortExcess: c.shortExcess,
          status: verify ? "VERIFIED" : "SUBMITTED",
          verifiedById: verify ? user.uid : null,
          verifiedAt: verify ? new Date() : null,
          oilLines: {
            create: input.oilLines.map((l) => ({
              name: l.name,
              qty: l.qty,
              unitPrice: l.unitPrice,
              amount: Math.round(l.qty * l.unitPrice * 100) / 100,
            })),
          },
          expenseLines: {
            create: input.expenseLines.map((l) => ({
              description: l.description,
              amount: l.amount,
            })),
          },
          creditLines: {
            create: input.creditLines.map((l) => ({
              customer: l.customer,
              amount: l.amount,
            })),
          },
        },
      });

      if (audits.length > 0) {
        await tx.entryAudit.createMany({
          data: audits.map((a) => ({ entryId: id, changedById: user.uid, ...a })),
        });
      }

      // Keep attendance consistent with the (possibly changed) date/shift.
      await tx.attendance.upsert({
        where: {
          employeeId_date_shift: {
            employeeId: existing.employeeId,
            date: toDate(meta.data.businessDate),
            shift: meta.data.shift,
          },
        },
        update: {},
        create: {
          employeeId: existing.employeeId,
          date: toDate(meta.data.businessDate),
          shift: meta.data.shift,
          status: "PRESENT",
          source: "AUTO",
        },
      });

      // If the date or shift moved, drop the attendance this submission had
      // auto-marked on its previous day/shift — unless another submission by
      // the same employee still covers it (e.g. MS + HSD on the same shift).
      const movedDayOrShift =
        isoDate(existing.businessDate) !== meta.data.businessDate ||
        existing.shift !== meta.data.shift;
      if (movedDayOrShift) {
        const stillCovered = await tx.dailyEntry.count({
          where: {
            employeeId: existing.employeeId,
            businessDate: existing.businessDate,
            shift: existing.shift,
          },
        });
        if (stillCovered === 0) {
          await tx.attendance.deleteMany({
            where: {
              employeeId: existing.employeeId,
              date: existing.businessDate,
              shift: existing.shift,
              source: "AUTO",
            },
          });
        }
      }
    });

    return NextResponse.json({
      ok: true,
      id,
      shortExcess: c.shortExcess,
      changes: audits.length,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Another sheet already exists for that date, shift and product." },
        { status: 409 },
      );
    }
    console.error("Failed to update entry", err);
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }
}
