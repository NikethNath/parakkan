import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { entryInputSchema, computeEntry, SHIFTS } from "@/lib/calc";
import { syncAttendanceForEntry } from "@/lib/attendance";

const metaSchema = z.object({
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  shift: z.enum(SHIFTS),
  partnerId: z.number().int().positive().nullable().optional(),
});

function toDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const meta = metaSchema.safeParse(body);
  const entry = entryInputSchema.safeParse(body); // strips meta keys

  if (!meta.success || !entry.success) {
    const issues = [
      ...(meta.success ? [] : meta.error.issues),
      ...(entry.success ? [] : entry.error.issues),
    ].map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
  }

  const input = entry.data;
  const c = computeEntry(input);

  // Optional partner (second person on the same DU) — must be another employee.
  const partnerId = meta.data.partnerId ?? null;
  if (partnerId != null) {
    if (partnerId === user.uid) {
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

  try {
    const created = await prisma.$transaction(async (tx) => {
      const e = await tx.dailyEntry.create({
        data: {
          employeeId: user.uid,
          partnerId,
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
          salaryTotal: c.salaryTotal,
          creditTotal: c.creditTotal,
          grossLitres: c.grossLitres,
          netSalableLitres: c.netSalableLitres,
          fuelExpected: c.fuelExpected,
          shortExcess: c.shortExcess,

          status: "SUBMITTED",
          submittedAt: new Date(),

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

      // Submitting a shift implies the employee (and any partner) worked it.
      await syncAttendanceForEntry(tx, {
        employeeId: user.uid,
        partnerId,
        date: toDate(meta.data.businessDate),
        shift: meta.data.shift,
      });

      return e;
    });

    return NextResponse.json({ ok: true, id: created.id, shortExcess: c.shortExcess });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A sheet for this date, shift and product already exists." },
        { status: 409 },
      );
    }
    console.error("Failed to create entry", err);
    return NextResponse.json({ error: "Could not save the sheet" }, { status: 500 });
  }
}
