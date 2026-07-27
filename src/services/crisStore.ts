import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CrisReport } from "./crisReport";
import type { CrisTransactionsReport } from "./crisTransactions";

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Upsert parsed CRIS daily rows into CrisDaily (keyed by date + product). */
export async function storeCrisReport(report: CrisReport): Promise<number> {
  for (const row of report.rows) {
    const businessDate = toDate(row.businessDate);
    const raw = { ...row } as unknown as Prisma.InputJsonObject;
    await prisma.crisDaily.upsert({
      where: { businessDate_product: { businessDate, product: row.product } },
      update: {
        officialSaleLitres: row.netTotalizerLitres,
        officialSaleAmount: 0,
        testLitres: row.testLitres,
        openingStock: row.openingStock ?? null,
        receiptQty: row.receiptQty ?? null,
        closingStock: row.closingStock ?? null,
        raw,
        fetchedAt: new Date(),
      },
      create: {
        businessDate,
        product: row.product,
        officialSaleLitres: row.netTotalizerLitres,
        officialSaleAmount: 0,
        testLitres: row.testLitres,
        openingStock: row.openingStock ?? null,
        receiptQty: row.receiptQty ?? null,
        closingStock: row.closingStock ?? null,
        raw,
      },
    });
  }
  return report.rows.length;
}

/** Upsert per-pump opening/closing totalizers into CrisPumpDaily
 *  (keyed by date + pump). */
export async function storeCrisPumpReadings(
  report: CrisTransactionsReport,
): Promise<number> {
  for (const row of report.rows) {
    const businessDate = toDate(row.businessDate);
    await prisma.crisPumpDaily.upsert({
      where: { businessDate_pump: { businessDate, pump: row.pump } },
      update: {
        product: row.product,
        openTotalizer: row.openTotalizer,
        closeTotalizer: row.closeTotalizer,
        txnCount: row.txnCount,
        fetchedAt: new Date(),
      },
      create: {
        businessDate,
        pump: row.pump,
        product: row.product,
        openTotalizer: row.openTotalizer,
        closeTotalizer: row.closeTotalizer,
        txnCount: row.txnCount,
      },
    });
  }
  return report.rows.length;
}
