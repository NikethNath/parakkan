import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { FUTURE_DATE_ERROR, isFutureBusinessDate } from "@/lib/businessDate";

/**
 * Types in one day's GPay and POS totals, read off the Paytm Business app.
 *
 * Paytm settles UPI and card as a single bank credit with no split in it, so
 * from 25 Aug 2026 the statement cannot supply these figures and the parser
 * skips those credits entirely. This is how they get in.
 *
 * A saved figure replaces the previous typed one for that day and channel; rows
 * parsed from a statement are never touched, and are superseded rather than
 * added to when the day is read back (see src/lib/bankFigures.ts).
 */

const amount = z.coerce.number().finite().min(0).max(100_000_000);

const bodySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  gpay: amount,
  pos: amount,
});

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const { businessDate, gpay, pos } = parsed.data;
  if (isFutureBusinessDate(businessDate)) {
    return NextResponse.json({ error: FUTURE_DATE_ERROR }, { status: 400 });
  }

  const date = toDate(businessDate);
  const narration = "Entered by hand from the Paytm Business app";

  await prisma.$transaction(async (tx) => {
    // Replace this day's typed figures wholesale — simpler than reconciling two
    // channels in place, and parsed rows are left alone either way.
    await tx.bankTxn.deleteMany({ where: { businessDate: date, enteredById: { not: null } } });
    await tx.bankTxn.createMany({
      data: (
        [
          ["GPAY", gpay],
          ["POS", pos],
        ] as const
      ).map(([channel, value]) => ({
        uploadId: null,
        enteredById: user.uid,
        txnDate: date,
        businessDate: date,
        amount: value,
        channel,
        narration,
      })),
    });
  });

  return NextResponse.json({ ok: true, businessDate, gpay, pos });
}
