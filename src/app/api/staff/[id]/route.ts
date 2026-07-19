import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  username: z.string().trim().toLowerCase().min(1).optional(),
  password: z.string().min(4).optional(),
  role: z.enum(["EMPLOYEE", "ADMIN", "ACCOUNTANT"]).optional(),
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
    if (body0?.active === false || (body0?.role && body0.role !== "ADMIN")) {
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

/**
 * Remove a staff account. A person with nothing in the books is permanently
 * deleted. A person WITH records (sheets, attendance, payments…) is ARCHIVED
 * instead: hidden from every staff list, login blocked, and their username
 * freed — so a new hire can reuse the same name/username and start with fresh
 * short/excess and attendance, while the old sheets keep the old person's
 * name and the books stay intact.
 */
export async function DELETE(
  _req: Request,
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
  if (id === user.uid) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      name: true,
      username: true,
      archivedAt: true,
      _count: {
        select: {
          entries: true,
          partnerEntries: true,
          verifiedEntries: true,
          attendance: true,
          audits: true,
          uploads: true,
          salaryPayments: true,
          recordedPayments: true,
        },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  const c = existing._count;
  const records =
    c.entries + c.partnerEntries + c.verifiedEntries + c.attendance +
    c.audits + c.uploads + c.salaryPayments + c.recordedPayments;
  if (records > 0) {
    // Archive: their sheets stay in the books under their name; the username
    // is mangled (kept unique) so a new hire can take the original one.
    const archivedName = existing.archivedAt
      ? existing.username // already archived — nothing left to free
      : `${existing.username}.left.${id}`;
    await prisma.user.update({
      where: { id },
      data: { active: false, archivedAt: existing.archivedAt ?? new Date(), username: archivedName },
    });
    return NextResponse.json({
      ok: true,
      id,
      archived: true,
      message:
        `${existing.name} had ${records} record${records === 1 ? "" : "s"} in the books, so the ` +
        "account was archived: their past sheets are untouched, they can no longer log in, and " +
        `the username "${existing.username.replace(/\.left\.\d+$/, "")}" is free for a new hire ` +
        "(who starts with zero short/excess and attendance).",
    });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    // A reference created between the check and the delete still blocks it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "They have records in the books — deactivate instead." },
        { status: 409 },
      );
    }
    console.error("Failed to delete staff", err);
    return NextResponse.json({ error: "Could not delete staff" }, { status: 500 });
  }
}
