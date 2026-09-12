import type { Prisma } from "@prisma/client";
import type { ParsedStatement } from "@/services/statement";
import { toNum, isoDate } from "@/lib/format";

/**
 * Stores the credits parsed out of a bank statement, skipping any that are
 * already held.
 *
 * Re-uploading a statement has to be safe — a month is usually exported more
 * than once, and the two accounts' date ranges overlap — so a credit is
 * identified by posting date, channel, amount and narration rather than by
 * which file it arrived in.
 */

export interface StatementFile {
  fileName: string;
  parsed: ParsedStatement;
}

export interface StatementFileResult {
  uploadId: number;
  fileName: string;
  account: string | null;
  found: number;
  inserted: number;
  duplicates: number;
  gpay: number;
  pos: number;
  /** Paytm settlements covering UPI and card at once — no channel to file them
   *  under, so the Paytm report supplies those days instead. */
  needsSplit: number;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const key = (txnDateIso: string, channel: string, amount: number, narration: string | null) =>
  `${txnDateIso}|${channel}|${amount.toFixed(2)}|${narration ?? ""}`;

export async function saveStatementTxns(
  tx: Prisma.TransactionClient,
  statements: StatementFile[],
  userId: number,
): Promise<StatementFileResult[]> {
  const allTxns = statements.flatMap((s) => s.parsed.txns);
  const dates = [...new Set(allTxns.map((t) => t.businessDate))].map(toDate);

  const existing = dates.length
    ? await tx.bankTxn.findMany({
        where: { businessDate: { in: dates } },
        select: { txnDate: true, channel: true, amount: true, narration: true },
      })
    : [];
  const seen = new Set(
    existing.map((e) => key(isoDate(e.txnDate), e.channel, toNum(e.amount), e.narration)),
  );

  const results: StatementFileResult[] = [];
  for (const { fileName, parsed } of statements) {
    const fresh = parsed.txns.filter((t) => {
      const k = key(t.txnDate, t.channel, t.amount, t.narration);
      if (seen.has(k)) return false;
      seen.add(k); // also guards against the same file being picked twice
      return true;
    });

    const upload = await tx.bankUpload.create({
      data: { uploadedById: userId, fileName },
    });
    if (fresh.length > 0) {
      await tx.bankTxn.createMany({
        data: fresh.map((t) => ({
          uploadId: upload.id,
          txnDate: toDate(t.txnDate),
          businessDate: toDate(t.businessDate),
          amount: t.amount,
          channel: t.channel,
          source: t.source,
          narration: t.narration,
        })),
      });
    }

    results.push({
      uploadId: upload.id,
      fileName,
      account: parsed.accountNumber ?? null,
      found: parsed.txns.length,
      inserted: fresh.length,
      duplicates: parsed.txns.length - fresh.length,
      gpay: fresh.filter((t) => t.channel === "GPAY").length,
      pos: fresh.filter((t) => t.channel === "POS").length,
      needsSplit: parsed.skippedCombined,
    });
  }

  return results;
}
