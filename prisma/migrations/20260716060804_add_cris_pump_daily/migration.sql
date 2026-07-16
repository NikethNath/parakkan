-- CreateTable
CREATE TABLE "CrisPumpDaily" (
    "id" SERIAL NOT NULL,
    "businessDate" DATE NOT NULL,
    "pump" INTEGER NOT NULL,
    "product" "Product" NOT NULL,
    "openTotalizer" DECIMAL(14,2) NOT NULL,
    "closeTotalizer" DECIMAL(14,2) NOT NULL,
    "txnCount" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrisPumpDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrisPumpDaily_businessDate_idx" ON "CrisPumpDaily"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "CrisPumpDaily_businessDate_pump_key" ON "CrisPumpDaily"("businessDate", "pump");
