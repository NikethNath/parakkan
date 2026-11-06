-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "lastRenewedOn" DATE,
ADD COLUMN     "renewEveryMonths" INTEGER,
ADD COLUMN     "renewalDueOn" DATE;
