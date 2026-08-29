-- AlterTable
ALTER TABLE "BankTxn" ADD COLUMN     "enteredById" INTEGER,
ALTER COLUMN "uploadId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "BankTxn" ADD CONSTRAINT "BankTxn_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- From 25 Aug 2026 a Paytm credit covers UPI *and* card in one lump, so it can
-- no longer be read as POS money. Any such row already imported is a wrong
-- figure (26 and 28 Aug showed a ~₹3L false POS excess), so it is removed here
-- rather than left to be corrected by hand. The parser now skips these credits,
-- so re-uploading the same statement will not bring them back; the day's real
-- split is typed in from the Paytm app instead. No-op if nothing was imported.
DELETE FROM "BankTxn"
 WHERE channel = 'POS'
   AND narration ILIKE '%PAYTM%'
   AND "businessDate" >= DATE '2026-08-25';
