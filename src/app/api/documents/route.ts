import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDocument, requireAdminApi, withArchiveRule } from "@/lib/documentApi";

/** Files a document in the index: its name, folder, tags and scan link. */
export async function POST(req: Request) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;

  const p = parseDocument(await req.json().catch(() => null));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  const data = await withArchiveRule(p.data);
  if (!data) return NextResponse.json({ error: "Pick a folder" }, { status: 400 });
  try {
    const d = await prisma.document.create({ data: { ...data, createdById: user.uid } });
    return NextResponse.json({ ok: true, id: d.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "Pick a folder" }, { status: 400 });
    }
    console.error("Failed to create document", err);
    return NextResponse.json({ error: "Could not add the document" }, { status: 500 });
  }
}
