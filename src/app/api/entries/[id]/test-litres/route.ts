import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { applyQuickPatch } from "@/lib/entryQuickPatch";

const bodySchema = z.object({
  testLitres: z.coerce.number().finite().min(0),
});

/**
 * Corrects one sheet's pump-test litres from the Summary tab.
 *
 * Test litres are the fuel pumped into the measure and poured back, so they are
 * dispensed but not sold: the sheet owes cash for `gross − test`. A wrong test
 * figure therefore shows up as a short or excess on that shift, and the day's
 * saleable litres and fuel value are wrong too — which is why this recomputes
 * and audits through `applyQuickPatch` instead of writing the column directly.
 *
 * The schema refuses a figure above the litres that sheet dispensed.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Enter a number of litres, zero or more." },
      { status: 400 },
    );
  }

  const res = await applyQuickPatch(id, { testLitres: body.data.testLitres }, user.uid);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, id, changes: res.changes });
}
