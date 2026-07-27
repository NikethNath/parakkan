import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const num = z.coerce.number().finite().min(0);
const bodySchema = z.object({
  openingStock: num.nullable().optional(),
  receiptQty: num.nullable().optional(),
  closingStock: num.nullable().optional(),
  officialSaleLitres: num.optional(),
  testLitres: num.optional(),
});

/**
 * Manual correction of one cached CRIS day (used by the DSR Daily sales
 * register when CRIS has a wrong or missing figure). Note: a later CRIS
 * re-fetch of the same day overwrites manual values — this is for patching
 * history, not maintaining a parallel ledger.
 */
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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  try {
    await prisma.crisDaily.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Day not found" }, { status: 404 });
  }
}
