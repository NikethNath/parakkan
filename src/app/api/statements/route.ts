import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { parseStatement } from "@/services/statement";
import { toNum, isoDate } from "@/lib/format";

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const key = (txnDateIso: string, channel: string, amount: number, narration: string | null) =>
  `${txnDateIso}|${channel}|${amount.toFixed(2)}|${narration ?? ""}`;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseStatement(text);
  if (parsed.txns.length === 0) {
    return NextResponse.json(
      { error: "No GPay/POS credits found — is this the right statement file?" },
      { status: 400 },
    );
  }

  // De-duplicate against rows already imported (handles re-uploading a statement).
  const dates = [...new Set(parsed.txns.map((t) => t.businessDate))].map(toDate);
  const existing = await prisma.bankTxn.findMany({
    where: { businessDate: { in: dates } },
    select: { txnDate: true, channel: true, amount: true, narration: true },
  });
  const seen = new Set(
    existing.map((e) => key(isoDate(e.txnDate), e.channel, toNum(e.amount), e.narration)),
  );
  const fresh = parsed.txns.filter(
    (t) => !seen.has(key(t.txnDate, t.channel, t.amount, t.narration)),
  );

  const upload = await prisma.bankUpload.create({
    data: { uploadedById: user.uid, fileName: file.name },
  });
  if (fresh.length > 0) {
    await prisma.bankTxn.createMany({
      data: fresh.map((t) => ({
        uploadId: upload.id,
        txnDate: toDate(t.txnDate),
        businessDate: toDate(t.businessDate),
        amount: t.amount,
        channel: t.channel,
        narration: t.narration,
      })),
    });
  }

  return NextResponse.json({
    ok: true,
    uploadId: upload.id,
    found: parsed.txns.length,
    inserted: fresh.length,
    duplicates: parsed.txns.length - fresh.length,
    gpay: parsed.txns.filter((t) => t.channel === "GPAY").length,
    pos: parsed.txns.filter((t) => t.channel === "POS").length,
  });
}
