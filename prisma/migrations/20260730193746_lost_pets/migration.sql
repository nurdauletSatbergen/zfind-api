/*
  Warnings:

  - A unique constraint covering the columns `[publicCode]` on the table `pets` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `publicCode` to the `pets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PetStatus" AS ENUM ('HOME', 'LOST');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SIGHTING';

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "publicCode" TEXT NOT NULL,
ADD COLUMN     "rewardAmount" DECIMAL(10,2),
ADD COLUMN     "status" "PetStatus" NOT NULL DEFAULT 'HOME';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "lost_episodes" (
    "id" SERIAL NOT NULL,
    "petId" INTEGER NOT NULL,
    "lostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foundAt" TIMESTAMP(3),

    CONSTRAINT "lost_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sightings" (
    "id" SERIAL NOT NULL,
    "petId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "comment" TEXT,
    "reporterPhone" TEXT,
    "photoFileId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sightings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lost_episodes_petId_lostAt_idx" ON "lost_episodes"("petId", "lostAt");

-- CreateIndex
CREATE UNIQUE INDEX "sightings_photoFileId_key" ON "sightings"("photoFileId");

-- CreateIndex
CREATE INDEX "sightings_petId_createdAt_idx" ON "sightings"("petId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pets_publicCode_key" ON "pets"("publicCode");

-- CreateIndex
CREATE INDEX "pets_status_idx" ON "pets"("status");

-- AddForeignKey
ALTER TABLE "lost_episodes" ADD CONSTRAINT "lost_episodes_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
