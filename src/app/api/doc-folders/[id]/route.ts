import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { folderCodeTaken, folderSchema, idFrom, requireAdminApi } from "@/lib/documentApi";

/** Renames, renumbers or relocates a folder. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const p = folderSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return NextResponse.json({ error: p.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (await folderCodeTaken(p.data.code, id)) {
    return NextResponse.json({ error: `There is already a folder ${p.data.code}.` }, { status: 409 });
  }
  try {
    await prisma.docFolder.update({
      where: { id },
      data: { code: p.data.code, name: p.data.name, location: p.data.location || null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002")
        return NextResponse.json({ error: `There is already a folder ${p.data.code}.` }, { status: 409 });
      if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Failed to update folder", err);
    return NextResponse.json({ error: "Could not save the folder" }, { status: 500 });
  }
}

/** Removes an empty folder. One that still holds documents is refused — the
 *  index would otherwise lose track of where they are. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;
  const id = await idFrom(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const held = await prisma.document.count({ where: { folderId: id } });
  if (held > 0) {
    return NextResponse.json(
      { error: `This folder still holds ${held} document${held === 1 ? "" : "s"} — move them to another folder first.` },
      { status: 409 },
    );
  }
  try {
    await prisma.docFolder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // A document filed into it between the count and the delete: the
    // foreign key refuses, which is the right outcome.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "This folder still holds documents." }, { status: 409 });
    }
    console.error("Failed to delete folder", err);
    return NextResponse.json({ error: "Could not delete the folder" }, { status: 500 });
  }
}
