import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isFutureBusinessDate } from "@/lib/businessDate";

/**
 * Records an outlet overhead — electricity, taxes, a licence fee. Money the
 * business paid directly, which never passed through a shift's till, so it has
 * no bearing on any sheet's short/excess.
 *
 * Admin-only to write. The accountant sees these on their summary but does not
 * record them, which keeps one person answerable for what went on the books.
 */

const createSchema = z.object({
  categoryId: z.number().int().positive(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amount: z.number().finite().positive("Amount must be more than zero"),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { categoryId, billDate, amount, note } = parsed.data;

  // A cost can't be booked before it has been incurred, and a future-dated row
  // would sit outside every report that stops at today.
  if (isFutureBusinessDate(billDate)) {
    return NextResponse.json(
      { error: "That date hasn't happened yet — book the cost on today or an earlier day." },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.outletExpense.create({
      data: {
        categoryId,
        billDate: new Date(`${billDate}T00:00:00.000Z`),
        amount,
        note: note || null,
        recordedById: user.uid,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    // A categoryId that doesn't exist, or points at a row since removed.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "Pick a category" }, { status: 400 });
    }
    console.error("Failed to record outlet overhead", err);
    return NextResponse.json({ error: "Could not record this cost" }, { status: 500 });
  }
}
