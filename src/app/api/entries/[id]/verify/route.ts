import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const schema = z.object({ verified: z.boolean() });

/** Lightweight "cash verified" toggle for the submissions list (no full edit). */
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

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { verified } = parsed.data;

  try {
    await prisma.dailyEntry.update({
      where: { id },
      data: {
        status: verified ? "VERIFIED" : "SUBMITTED",
        verifiedById: verified ? user.uid : null,
        verifiedAt: verified ? new Date() : null,
      },
    });
    return NextResponse.json({ ok: true, verified });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Failed to set cash-verified", err);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
}
