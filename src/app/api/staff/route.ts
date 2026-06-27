import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().trim().min(1),
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(4),
  role: z.enum(["EMPLOYEE", "ADMIN"]).default("EMPLOYEE"),
  phone: z.string().trim().optional(),
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
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { password, ...rest } = parsed.data;
  try {
    const created = await prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    console.error("Failed to create staff", err);
    return NextResponse.json({ error: "Could not create staff" }, { status: 500 });
  }
}
