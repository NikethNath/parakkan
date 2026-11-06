import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkDriveUrl, isArchiveFolder, normaliseTags } from "@/lib/documents";
import { istToday } from "@/lib/format";

/** The document index is the owner's alone — staff and the accountant get 403. */
export async function requireAdminApi(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export const folderSchema = z.object({
  code: z.string().trim().min(1, "Give the folder its number or label").max(20),
  name: z.string().trim().min(1, "Give the folder a name").max(80),
  location: z.string().trim().max(120).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const documentSchema = z.object({
  title: z.string().trim().min(1, "Give the document a name").max(160),
  folderId: z.number().int().positive("Pick a folder"),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  driveUrl: z.string().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  // How it renews: not at all, on a fixed date, or every N months.
  renewalMode: z.enum(["none", "fixed", "every"]).default("none"),
  renewEveryMonths: z.number().int().min(1, "Renews at least every month").max(120).optional(),
  lastRenewedOn: isoDate.optional(),
  renewalDueOn: isoDate.optional(),
});

export interface Renewal {
  renewEveryMonths: number | null;
  lastRenewedOn: Date | null;
  renewalDueOn: Date | null;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const RENEWED_IN_FUTURE = "It can't have been renewed on a date that hasn't happened yet.";

/** Validates a document body, normalising tags and the Drive link. */
export function parseDocument(body: unknown):
  | {
      ok: true;
      data: {
        title: string;
        folderId: number;
        tags: string[];
        driveUrl: string | null;
        notes: string | null;
      } & Renewal;
    }
  | { ok: false; error: string } {
  const p = documentSchema.safeParse(body);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input" };
  const link = checkDriveUrl(p.data.driveUrl ?? "");
  if (!link.ok) return { ok: false, error: link.error };

  // Only the fields the chosen mode uses are kept, so switching a document
  // from "every year" to "doesn't renew" can't leave an old date driving it.
  const d = p.data;
  let renewal: Renewal = { renewEveryMonths: null, lastRenewedOn: null, renewalDueOn: null };
  if (d.lastRenewedOn && d.lastRenewedOn > istToday()) return { ok: false, error: RENEWED_IN_FUTURE };
  if (d.renewalMode === "every") {
    if (!d.renewEveryMonths) return { ok: false, error: "Pick how often it renews" };
    // The next due date is worked out from this, so it can't be left blank.
    if (!d.lastRenewedOn) return { ok: false, error: "Enter when it was last renewed" };
    renewal = { renewEveryMonths: d.renewEveryMonths, lastRenewedOn: toDate(d.lastRenewedOn), renewalDueOn: null };
  } else if (d.renewalMode === "fixed") {
    if (!d.renewalDueOn) return { ok: false, error: "Enter the renewal date" };
    renewal = {
      renewEveryMonths: null,
      lastRenewedOn: d.lastRenewedOn ? toDate(d.lastRenewedOn) : null,
      renewalDueOn: toDate(d.renewalDueOn),
    };
  }

  return {
    ok: true,
    data: {
      title: d.title,
      folderId: d.folderId,
      tags: normaliseTags(d.tags ?? []),
      driveUrl: link.url,
      notes: d.notes || null,
      ...renewal,
    },
  };
}

/**
 * Filing a document into an archive folder (a Z code) drops its renewal rule:
 * an archived copy is superseded and must never come up as overdue. Returns
 * null when the folder doesn't exist.
 */
export async function withArchiveRule<T extends Renewal & { folderId: number }>(data: T): Promise<T | null> {
  const folder = await prisma.docFolder.findUnique({ where: { id: data.folderId }, select: { code: true } });
  if (!folder) return null;
  return isArchiveFolder(folder)
    ? { ...data, renewEveryMonths: null, lastRenewedOn: null, renewalDueOn: null }
    : data;
}

/** True when another folder already uses this code, ignoring case — "z-1" and
 *  "Z-1" would be the same label on two spines. */
export async function folderCodeTaken(code: string, exceptId?: number): Promise<boolean> {
  const clash = await prisma.docFolder.findFirst({
    where: { code: { equals: code.trim(), mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return clash !== null;
}

export const idFrom = async (ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};
