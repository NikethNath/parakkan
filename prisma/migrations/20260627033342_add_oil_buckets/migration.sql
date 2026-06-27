-- AlterTable
ALTER TABLE "OilLine" ADD COLUMN     "bucketId" INTEGER;

-- CreateTable
CREATE TABLE "OilBucket" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OilBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OilBucket_name_key" ON "OilBucket"("name");

-- AddForeignKey
ALTER TABLE "OilLine" ADD CONSTRAINT "OilLine_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "OilBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
