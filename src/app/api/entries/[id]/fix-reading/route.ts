import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { applyQuickPatch, type QuickPatch } from "@/lib/entryQuickPatch";

const fieldEnum = z.enum(["n1Open", "n1Close", "n2Open", "n2Close"]);
const bodySchema = z.object({
  // One write replaces a wrong reading; two writes fill a blank nozzle pair.
  fields: z
    .array(z.object({ field: fieldEnum, value: z.coerce.number().finite().min(0) }))
    .min(1)
    .max(2)
    .refine((fs) => new Set(fs.map((f) => f.field)).size === fs.length, "Duplicate field"),
});

/**
 * Quick-fix for meter readings: replace a staff reading that disagrees with the
 * official CRIS totalizer, fill a missing nozzle pair from it, or settle a
 * midday handover where the two sheets disagree.
 *
 * The recompute and the audit trail live in `applyQuickPatch` — same rules as a
 * full admin edit, without resubmitting the whole sheet.
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
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const patch: QuickPatch = {};
  for (const f of body.data.fields) patch[f.field] = f.value;

  const res = await applyQuickPatch(id, patch, user.uid);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, id, changes: res.changes });
}
