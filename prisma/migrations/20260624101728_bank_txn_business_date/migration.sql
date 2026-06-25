/*
  Warnings:

  - Added the required column `businessDate` to the `BankTxn` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BankTxn" ADD COLUMN     "businessDate" DATE NOT NULL;

-- CreateIndex
CREATE INDEX "BankTxn_businessDate_idx" ON "BankTxn"("businessDate");
