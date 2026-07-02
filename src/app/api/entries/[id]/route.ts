import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { entryInputSchema, computeEntry, SHIFTS } from "@/lib/calc";
import { toNum, isoDate } from "@/lib/format";
import { syncAttendanceForEntry, syncAttendanceForUpdate } from "@/lib/attendance";

const metaSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(SHIFTS),
  verify: z.boolean().optional(),
  partnerId: z.number().int().positive().nullable().optional(),
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
      // Recompute attendance for the employee and any partner — drops the AUTO
      // mark unless another sheet still covers that day/shift (a MANUAL mark is
      // left alone).
      await syncAttendanceForEntry(tx, {
        employeeId: existing.employeeId,
        partnerId: existing.partnerId,
        date: existing.businessDate,
        shift: existing.shift,
      });
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
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  // Admins can edit any sheet (logged in the audit trail). An employee may fix
  // their OWN sheet, but only until the admin verifies it — after that it's
  // locked to them.
  const isAdmin = user.role === "ADMIN";
  if (!isAdmin) {
    if (existing.employeeId !== user.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status === "VERIFIED") {
      return NextResponse.json(
        {
          error:
            "This sheet has been verified and can no longer be edited. Ask the admin to make changes.",
        },
        { status: 403 },
      );
    }
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

  // Employees may correct the figures on an existing sheet but not move it to
  // another day — the date is the one change with cross-month payroll impact, so
  // it's pinned to whatever it already was. Admins can still re-date a sheet.
  const businessDate = isAdmin ? meta.data.businessDate : isoDate(existing.businessDate);

  // Optional partner (second person on the DU). Employees may set/clear it too.
  const partnerId = meta.data.partnerId ?? null;
  if (partnerId != null) {
    if (partnerId === existing.employeeId) {
      return NextResponse.json({ error: "Partner can't be the same person." }, { status: 400 });
    }
    const p = await prisma.user.findFirst({
      where: { id: partnerId, role: "EMPLOYEE" },
      select: { id: true },
    });
    if (!p) {
      return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
    }
  }

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

  cmpStr("businessDate", isoDate(existing.businessDate), businessDate);
  cmpStr("shift", existing.shift, meta.data.shift);
  cmpStr("product", existing.product, input.product);
  for (const f of INPUT_FIELDS) cmpNum(f, ex[f], inp[f]);
  cmpNum("cashTotal", existing.cashTotal, c.cashTotal);
  cmpNum("oilTotal", existing.oilTotal, c.oilTotal);
  cmpNum("expensesTotal", existing.expensesTotal, c.expensesTotal);
  cmpNum("salaryTotal", existing.salaryTotal, c.salaryTotal);
  cmpNum("creditTotal", existing.creditTotal, c.creditTotal);
  cmpNum("fuelExpected", existing.fuelExpected, c.fuelExpected);
  cmpNum("shortExcess", existing.shortExcess, c.shortExcess);

  // Partner change — logged for admins with names (it moves the 50/50 split).
  if (isAdmin && (existing.partnerId ?? null) !== partnerId) {
    const ids = [existing.partnerId, partnerId].filter((x): x is number => x != null);
    const names = ids.length
      ? Object.fromEntries(
          (
            await prisma.user.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name] as const),
        )
      : ({} as Record<number, string>);
    audits.push({
      field: "partner",
      oldValue: existing.partnerId ? names[existing.partnerId] ?? String(existing.partnerId) : "none",
      newValue: partnerId ? names[partnerId] ?? String(partnerId) : "none",
    });
  }

  // Only an admin can verify (and thereby lock) a sheet; an employee's save
  // always leaves it SUBMITTED so it stays editable until the admin checks it.
  const verify = isAdmin ? (meta.data.verify ?? existing.status === "VERIFIED") : false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.oilLine.deleteMany({ where: { entryId: id } });
      await tx.expenseLine.deleteMany({ where: { entryId: id } });
      await tx.salaryLine.deleteMany({ where: { entryId: id } });
      await tx.creditLine.deleteMany({ where: { entryId: id } });

      await tx.dailyEntry.update({
        where: { id },
        data: {
          businessDate: toDate(businessDate),
          shift: meta.data.shift,
          product: input.product,
          partnerId,
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
          salaryTotal: c.salaryTotal,
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
              qty: 0, // qty/unitPrice retired — staff now type the amount directly
              unitPrice: 0,
              amount: l.amount,
            })),
          },
          expenseLines: {
            create: input.expenseLines.map((l) => ({
              description: l.description,
              amount: l.amount,
            })),
          },
          salaryLines: {
            create: input.salaryLines.map((l) => ({
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

      // Only log admin overrides — a pre-verification self-correction by the
      // employee isn't an "edited after the fact" event worth flagging.
      if (isAdmin && audits.length > 0) {
        await tx.entryAudit.createMany({
          data: audits.map((a) => ({ entryId: id, changedById: user.uid, ...a })),
        });
      }

      // Recompute attendance for everyone this change could touch: the employee
      // and any partner, on both the new and the previous day/shift (so a moved
      // date, a moved shift, or a swapped/removed partner all self-correct).
      await syncAttendanceForUpdate(
        tx,
        {
          employeeId: existing.employeeId,
          partnerId: existing.partnerId,
          date: existing.businessDate,
          shift: existing.shift,
        },
        {
          employeeId: existing.employeeId,
          partnerId,
          date: toDate(businessDate),
          shift: meta.data.shift,
        },
      );
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
