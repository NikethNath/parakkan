-- CreateTable
CREATE TABLE "PaytmQrDay" (
    "id" SERIAL NOT NULL,
    "businessDate" DATE NOT NULL,
    "posId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "PaytmQrDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispenser" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "posId" TEXT NOT NULL,

    CONSTRAINT "Dispenser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenserNozzle" (
    "id" SERIAL NOT NULL,
    "dispenserId" INTEGER NOT NULL,
    "product" "Product" NOT NULL,
    "reading" DECIMAL(12,2) NOT NULL,
    "readOn" DATE NOT NULL,

    CONSTRAINT "DispenserNozzle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaytmQrDay_businessDate_posId_key" ON "PaytmQrDay"("businessDate", "posId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispenser_name_key" ON "Dispenser"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Dispenser_posId_key" ON "Dispenser"("posId");

-- AddForeignKey
ALTER TABLE "DispenserNozzle" ADD CONSTRAINT "DispenserNozzle_dispenserId_fkey" FOREIGN KEY ("dispenserId") REFERENCES "Dispenser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
