-- AlterTable
ALTER TABLE "lost_episodes" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactPhones" TEXT[],
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;
