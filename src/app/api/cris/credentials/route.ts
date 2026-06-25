import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { setCrisCredentials } from "@/lib/crisCreds";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }
  try {
    await setCrisCredentials(parsed.data.username, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save CRIS credentials", err);
    return NextResponse.json(
      { error: "Could not save (is SECRET_KEY set correctly?)" },
      { status: 500 },
    );
  }
}
