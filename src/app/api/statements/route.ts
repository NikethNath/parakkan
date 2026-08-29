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
  // A full month now spans two accounts (main + Paytm), so several statements
  // can be sent in one go.
  const files = (formData?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const statements = await Promise.all(
    files.map(async (file) => ({ file, parsed: parseStatement(await file.text()) })),
  );
  const allTxns = statements.flatMap((s) => s.parsed.txns);
  // A Paytm statement can legitimately hold nothing but combined settlements —
  // every credit unattributable, so nothing to store, but the upload was still
  // valid and the reply tells the admin how many days need a split typed in.
  const combined = statements.reduce((n, s) => n + s.parsed.skippedCombined, 0);
  if (allTxns.length === 0 && combined === 0) {
    return NextResponse.json(
      {
        error:
          files.length === 1
            ? "No GPay/POS credits found — is this the right statement file?"
            : "No GPay/POS credits found in any of these files.",
      },
      { status: 400 },
    );
  }

  // De-duplicate against rows already imported (handles re-uploading a
  // statement, or two files whose date ranges overlap).
  const dates = [...new Set(allTxns.map((t) => t.businessDate))].map(toDate);
  const existing = await prisma.bankTxn.findMany({
    where: { businessDate: { in: dates } },
    select: { txnDate: true, channel: true, amount: true, narration: true },
  });
  const seen = new Set(
    existing.map((e) => key(isoDate(e.txnDate), e.channel, toNum(e.amount), e.narration)),
  );

  interface FileResult {
    uploadId: number;
    fileName: string;
    account: string | null;
    found: number;
    inserted: number;
    duplicates: number;
    gpay: number;
    pos: number;
    needsSplit: number;
  }
  const results: FileResult[] = [];
  for (const { file, parsed } of statements) {
    const fresh = parsed.txns.filter((t) => {
      const k = key(t.txnDate, t.channel, t.amount, t.narration);
      if (seen.has(k)) return false;
      seen.add(k); // also guards against the same file being sent twice
      return true;
    });

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

    results.push({
      uploadId: upload.id,
      fileName: file.name,
      account: parsed.accountNumber ?? null,
      found: parsed.txns.length,
      inserted: fresh.length,
      duplicates: parsed.txns.length - fresh.length,
      gpay: fresh.filter((t) => t.channel === "GPAY").length,
      pos: fresh.filter((t) => t.channel === "POS").length,
      // Paytm settles UPI and card in one credit, so these can't be attributed
      // to a channel — the day's split gets typed in on the reconcile table.
      needsSplit: parsed.skippedCombined,
    });
  }

  const total = (k: "found" | "inserted" | "duplicates" | "gpay" | "pos" | "needsSplit") =>
    results.reduce((s, r) => s + r[k], 0);

  return NextResponse.json({
    ok: true,
    files: results,
    uploadId: results[results.length - 1].uploadId,
    found: total("found"),
    inserted: total("inserted"),
    duplicates: total("duplicates"),
    gpay: total("gpay"),
    pos: total("pos"),
    needsSplit: total("needsSplit"),
  });
}
