-- CreateEnum
CREATE TYPE "PetSex" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "color" TEXT,
ADD COLUMN     "sex" "PetSex";
