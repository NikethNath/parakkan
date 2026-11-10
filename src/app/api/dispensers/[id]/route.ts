import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { idFrom, requireAdminApi } from "@/lib/documentApi";
import { clashMessage, dispenserSchema, nozzleRows } from "@/lib/dispenserSchema";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a DU. Its nozzles are replaced wholesale — re-binding a nozzle to a
 *  fresh reading is the fix when one has drifted out of sight. */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = dispenserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid DU" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    await prisma.$transaction([
      prisma.dispenserNozzle.deleteMany({ where: { dispenserId: id } }),
      prisma.dispenser.update({
        where: { id },
        data: { name: d.name, posId: d.posId, nozzles: { create: nozzleRows(d) } },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = clashMessage(e);
    if (msg) return NextResponse.json({ error: msg }, { status: 409 });
    if ((e as { code?: string }).code === "P2025")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { count } = await prisma.dispenser.deleteMany({ where: { id } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
