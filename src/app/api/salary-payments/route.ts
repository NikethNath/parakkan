import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// Record a salary advance / payment given to an employee for a month. Covers
// both money handed over directly (an advance not taken from a daily sheet) and
// the final settlement. Net owed = earned − advances drawn − these payments.
const schema = z.object({
  employeeId: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().finite().positive(),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  try {
    const p = await prisma.salaryPayment.create({
      data: {
        employeeId: parsed.data.employeeId,
        month: parsed.data.month,
        amount: parsed.data.amount,
        note: parsed.data.note || null,
        recordedById: user.uid,
      },
    });
    return NextResponse.json({ ok: true, id: p.id });
  } catch (err) {
    console.error("Failed to record salary payment", err);
    return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
  }
}
