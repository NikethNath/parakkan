import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { idFrom, parseDocument, requireAdminApi, withArchiveRule } from "@/lib/documentApi";

/** Edits a document — including moving it to another folder. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const p = parseDocument(await req.json().catch(() => null));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  // Moving a document into a Z folder archives it, which ends its renewals.
  const data = await withArchiveRule(p.data);
  if (!data) return NextResponse.json({ error: "Pick a folder" }, { status: 400 });
  try {
    await prisma.document.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (err.code === "P2003") return NextResponse.json({ error: "Pick a folder" }, { status: 400 });
    }
    console.error("Failed to update document", err);
    return NextResponse.json({ error: "Could not save the document" }, { status: 500 });
  }
}

/** Removes a document from the index. The paper and the Drive scan are not
 *  touched — this only forgets where it was. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Failed to delete document", err);
    return NextResponse.json({ error: "Could not delete the document" }, { status: 500 });
  }
}
