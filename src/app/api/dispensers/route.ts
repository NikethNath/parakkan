import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/documentApi";
import { clashMessage, dispenserSchema, nozzleRows } from "@/lib/dispenserSchema";

/** Set up a DU: its Paytm QR and the readings that bind its nozzles. */
export async function POST(req: Request) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;

  const parsed = dispenserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid DU" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const created = await prisma.dispenser.create({
      data: { name: d.name, posId: d.posId, nozzles: { create: nozzleRows(d) } },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    const msg = clashMessage(e);
    if (msg) return NextResponse.json({ error: msg }, { status: 409 });
    throw e;
  }
}
