-- CreateTable
CREATE TABLE "OutletExpense" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "billDate" DATE NOT NULL,
    "note" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutletExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutletExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutletExpense_billDate_idx" ON "OutletExpense"("billDate");

-- CreateIndex
CREATE UNIQUE INDEX "OutletExpenseCategory_name_key" ON "OutletExpenseCategory"("name");

-- AddForeignKey
ALTER TABLE "OutletExpense" ADD CONSTRAINT "OutletExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "OutletExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletExpense" ADD CONSTRAINT "OutletExpense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starter categories, so the page is usable the moment it opens. The two the
-- owner named plus the other recurring outlet bills; any can be deactivated
-- from the Expenses tab, and ON CONFLICT keeps a re-run harmless.
INSERT INTO "OutletExpenseCategory" ("name") VALUES
  ('Electricity'),
  ('Taxes'),
  ('Licence & fees'),
  ('Insurance'),
  ('Repairs & maintenance')
ON CONFLICT ("name") DO NOTHING;
