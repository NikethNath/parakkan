import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/** Removes an overhead that was recorded wrongly. Nothing downstream depends on
 *  the row, so it is deleted outright rather than kept as a reversal. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  try {
    await prisma.outletExpense.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Failed to delete outlet overhead", err);
    return NextResponse.json({ error: "Could not delete this cost" }, { status: 500 });
  }
}
