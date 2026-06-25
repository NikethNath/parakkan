import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { SHIFTS } from "@/lib/calc";

const schema = z.object({
  employeeId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(SHIFTS),
  status: z.enum(["PRESENT", "ABSENT", "LEAVE", "CLEAR"]),
});

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { employeeId, date, shift, status } = parsed.data;
  const businessDate = toDate(date);

  if (status === "CLEAR") {
    await prisma.attendance.deleteMany({ where: { employeeId, date: businessDate, shift } });
  } else {
    await prisma.attendance.upsert({
      where: { employeeId_date_shift: { employeeId, date: businessDate, shift } },
      update: { status, source: "MANUAL" },
      create: { employeeId, date: businessDate, shift, status, source: "MANUAL" },
    });
  }
  return NextResponse.json({ ok: true });
}
