import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { folderSchema, requireAdminApi } from "@/lib/documentApi";

/** Adds a physical folder to the document index. */
export async function POST(req: Request) {
  const user = await requireAdminApi();
  if (user instanceof NextResponse) return user;

  const p = folderSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return NextResponse.json({ error: p.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const f = await prisma.docFolder.create({
      data: { code: p.data.code, name: p.data.name, location: p.data.location || null },
    });
    return NextResponse.json({ ok: true, id: f.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `There is already a folder ${p.data.code}.` }, { status: 409 });
    }
    console.error("Failed to create folder", err);
    return NextResponse.json({ error: "Could not add the folder" }, { status: 500 });
  }
}
