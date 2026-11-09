import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { istToday, toNum } from "@/lib/format";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  product: z.enum(["MS", "HSD"]),
  // 0 clears it.
  litres: z.coerce.number().finite().min(0, "Litres can't be negative"),
  note: z.string().trim().max(300).optional(),
});

/**
 * Records the fuel a repairman pumped through a dispenser during maintenance
 * without authorising it as a test — litres CRIS counts as sold. One figure per
 * day and product; sending it again replaces it, sending 0 removes it.
 *
 * CRIS's own cached figures are never touched (a re-fetch would overwrite them
 * anyway); the CRIS tab subtracts this when comparing against the staff.
 */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const p = bodySchema.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return NextResponse.json({ error: p.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { date, product, litres, note } = p.data;
  if (date > istToday()) {
    return NextResponse.json({ error: "That day hasn't happened yet." }, { status: 400 });
  }
  const businessDate = new Date(`${date}T00:00:00.000Z`);
  const key = { businessDate_product: { businessDate, product } };

  if (litres === 0) {
    await prisma.maintenanceTest.deleteMany({ where: { businessDate, product } });
    return NextResponse.json({ ok: true, litres: 0 });
  }

  // It corrects a CRIS figure, so there has to be one, and it can't claim more
  // was test fuel than CRIS says left the dispensers at all.
  const cris = await prisma.crisDaily.findUnique({ where: key, select: { officialSaleLitres: true } });
  if (!cris) {
    return NextResponse.json(
      { error: "There are no CRIS figures for that day yet — fetch or upload CRIS first." },
      { status: 400 },
    );
  }
  const sold = toNum(cris.officialSaleLitres);
  if (litres > sold) {
    return NextResponse.json(
      { error: `CRIS only shows ${sold.toFixed(2)} L sold that day, so the test can't be ${litres.toFixed(2)} L.` },
      { status: 400 },
    );
  }

  await prisma.maintenanceTest.upsert({
    where: key,
    create: { businessDate, product, litres, note: note || null, recordedById: user.uid },
    update: { litres, note: note || null, recordedById: user.uid },
  });
  return NextResponse.json({ ok: true, litres });
}
