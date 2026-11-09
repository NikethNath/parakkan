-- CreateTable
CREATE TABLE "MaintenanceTest" (
    "id" SERIAL NOT NULL,
    "businessDate" DATE NOT NULL,
    "product" "Product" NOT NULL,
    "litres" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "recordedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTest_businessDate_product_key" ON "MaintenanceTest"("businessDate", "product");

-- AddForeignKey
ALTER TABLE "MaintenanceTest" ADD CONSTRAINT "MaintenanceTest_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
