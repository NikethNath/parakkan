import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { istToday, isoDate } from "@/lib/format";
import { idFrom, requireAdminApi, RENEWED_IN_FUTURE } from "@/lib/documentApi";
import { nextDue } from "@/lib/documents";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  /** The day it was renewed; defaults to today. */
  renewedOn: iso.optional(),
  /** The new expiry, for a document that renews on a fixed date. */
  nextDueOn: iso.optional(),
});

/**
 * Records that a document has been renewed — the one-click action the renewal
 * queue exists for.
 *
 * A document that renews every N months only needs the day it was renewed; its
 * next due date follows from that. One that renews on a fixed date needs the
 * new date from the new certificate, which has to be later than the old one or
 * nothing has actually moved.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Pick a date" }, { status: 400 });

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { renewEveryMonths: true, lastRenewedOn: true, renewalDueOn: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const renewedOn = body.data.renewedOn ?? istToday();
  if (renewedOn > istToday()) return NextResponse.json({ error: RENEWED_IN_FUTURE }, { status: 400 });
  const at = (s: string) => new Date(`${s}T00:00:00.000Z`);

  if (doc.renewEveryMonths) {
    await prisma.document.update({ where: { id }, data: { lastRenewedOn: at(renewedOn) } });
  } else if (doc.renewalDueOn) {
    const next = body.data.nextDueOn;
    if (!next) return NextResponse.json({ error: "Enter the new renewal date" }, { status: 400 });
    if (next <= isoDate(doc.renewalDueOn)) {
      return NextResponse.json(
        { error: `The new date has to be after the current one (${isoDate(doc.renewalDueOn)}).` },
        { status: 400 },
      );
    }
    await prisma.document.update({
      where: { id },
      data: { lastRenewedOn: at(renewedOn), renewalDueOn: at(next) },
    });
  } else {
    return NextResponse.json(
      { error: "This document isn't set to renew — edit it to add a renewal date or frequency." },
      { status: 400 },
    );
  }

  const updated = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: { renewEveryMonths: true, lastRenewedOn: true, renewalDueOn: true },
  });
  return NextResponse.json({
    ok: true,
    nextDue: nextDue({
      renewEveryMonths: updated.renewEveryMonths,
      lastRenewedOn: updated.lastRenewedOn ? isoDate(updated.lastRenewedOn) : null,
      renewalDueOn: updated.renewalDueOn ? isoDate(updated.renewalDueOn) : null,
    }),
  });
}
