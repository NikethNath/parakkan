import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CrisReport } from "./crisReport";

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
        raw,
        fetchedAt: new Date(),
      },
      create: {
        businessDate,
        product: row.product,
        officialSaleLitres: row.netTotalizerLitres,
        officialSaleAmount: 0,
        testLitres: row.testLitres,
        raw,
      },
    });
  }
  return report.rows.length;
}
