-- AlterTable
ALTER TABLE "BankTxn" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'STATEMENT';

-- Backfill what already exists. Rows are classified by where the money came
-- through, because that is what decides whether figures for a day add up or
-- supersede each other (see sumBankFigures in src/lib/bankFigures.ts).
UPDATE "BankTxn" SET source = 'PAYTM_REPORT' WHERE "enteredById" IS NOT NULL;
UPDATE "BankTxn" SET source = 'PAYTM_BANK'
 WHERE "enteredById" IS NULL AND narration ILIKE '%paytm%';
