-- AlterTable
ALTER TABLE "CreditLine" ADD COLUMN     "creditorId" INTEGER;

-- AlterTable
ALTER TABLE "ExpenseLine" ADD COLUMN     "bucketId" INTEGER;

-- CreateTable
CREATE TABLE "Creditor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBucket" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Creditor_name_key" ON "Creditor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBucket_name_key" ON "ExpenseBucket"("name");

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "ExpenseBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLine" ADD CONSTRAINT "CreditLine_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "Creditor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
