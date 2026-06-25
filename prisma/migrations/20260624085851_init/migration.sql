-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'ADMIN');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('MONTHLY', 'PER_SHIFT');

-- CreateEnum
CREATE TYPE "Product" AS ENUM ('MS', 'HSD');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "payType" "PayType" NOT NULL DEFAULT 'MONTHLY',
    "monthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shiftRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "joinedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "product" "Product" NOT NULL,
    "rate" DECIMAL(8,2) NOT NULL,
    "n1Open" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "n1Close" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "n2Open" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "n2Close" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "testLitres" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "q2000" INTEGER NOT NULL DEFAULT 0,
    "q500" INTEGER NOT NULL DEFAULT 0,
    "q200" INTEGER NOT NULL DEFAULT 0,
    "q100" INTEGER NOT NULL DEFAULT 0,
    "q50" INTEGER NOT NULL DEFAULT 0,
    "q20" INTEGER NOT NULL DEFAULT 0,
    "q10" INTEGER NOT NULL DEFAULT 0,
    "q5" INTEGER NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gpay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cashTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "oilTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expensesTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossLitres" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSalableLitres" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fuelExpected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shortExcess" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "EntryStatus" NOT NULL DEFAULT 'SUBMITTED',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OilLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OilLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "customer" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "CreditLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryAudit" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "changedById" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,

    CONSTRAINT "EntryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrisDaily" (
    "id" SERIAL NOT NULL,
    "businessDate" DATE NOT NULL,
    "product" "Product" NOT NULL,
    "officialSaleAmount" DECIMAL(14,2) NOT NULL,
    "officialSaleLitres" DECIMAL(14,3) NOT NULL,
    "testLitres" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrisDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankUpload" (
    "id" SERIAL NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTxn" (
    "id" SERIAL NOT NULL,
    "uploadId" INTEGER NOT NULL,
    "txnDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "channel" TEXT NOT NULL,
    "narration" TEXT,
    "matchedEntryId" INTEGER,

    CONSTRAINT "BankTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrisCredential" (
    "id" SERIAL NOT NULL,
    "encUsername" TEXT NOT NULL,
    "encPassword" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrisCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "DailyEntry_businessDate_idx" ON "DailyEntry"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_employeeId_businessDate_shift_product_key" ON "DailyEntry"("employeeId", "businessDate", "shift", "product");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_date_shift_key" ON "Attendance"("employeeId", "date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "CrisDaily_businessDate_product_key" ON "CrisDaily"("businessDate", "product");

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OilLine" ADD CONSTRAINT "OilLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLine" ADD CONSTRAINT "CreditLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryAudit" ADD CONSTRAINT "EntryAudit_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryAudit" ADD CONSTRAINT "EntryAudit_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankUpload" ADD CONSTRAINT "BankUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTxn" ADD CONSTRAINT "BankTxn_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "BankUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
