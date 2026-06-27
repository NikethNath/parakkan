import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
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
  try {
    const c = await prisma.creditor.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        notes: parsed.data.notes || null,
      },
    });
    return NextResponse.json({ ok: true, id: c.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "A creditor with that name already exists." }, { status: 409 });
    }
    console.error("Failed to create creditor", err);
    return NextResponse.json({ error: "Could not create creditor" }, { status: 500 });
  }
}
