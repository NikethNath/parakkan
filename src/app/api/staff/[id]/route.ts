import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  username: z.string().trim().toLowerCase().min(1).optional(),
  password: z.string().min(4).optional(),
  role: z.enum(["EMPLOYEE", "ADMIN"]).optional(),
  payType: z.enum(["MONTHLY", "PER_SHIFT"]).optional(),
  shiftRate: z.coerce.number().min(0).optional(),
  monthlySalary: z.coerce.number().min(0).optional(),
  extraPay: z.coerce.number().min(0).optional(),
  phone: z.string().trim().optional(),
  active: z.boolean().optional(),
});

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

  // Guard: don't let an admin deactivate or demote themselves into a lockout.
  if (id === user.uid) {
    const body0 = await req.clone().json().catch(() => ({}));
    if (body0?.active === false || body0?.role === "EMPLOYEE") {
      return NextResponse.json(
        { error: "You can't deactivate or demote your own admin account." },
        { status: 400 },
      );
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { password, ...rest } = parsed.data;
  const data: Prisma.UserUpdateInput = { ...rest };
  if (password) data.passwordHash = await hashPassword(password);

  try {
    await prisma.user.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002")
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      if (err.code === "P2025")
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    console.error("Failed to update staff", err);
    return NextResponse.json({ error: "Could not update staff" }, { status: 500 });
  }
}
