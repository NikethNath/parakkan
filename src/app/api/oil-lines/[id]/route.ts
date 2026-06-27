import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// Assign (or clear, with null) the oil bucket for one staff oil line.
const schema = z.object({ bucketId: z.number().int().positive().nullable() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    await prisma.oilLine.update({
      where: { id },
      data: { bucketId: parsed.data.bucketId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (err.code === "P2003") return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
    }
    console.error("Failed to classify oil line", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
