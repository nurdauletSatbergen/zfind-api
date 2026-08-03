-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT', 'BIRD', 'OTHER');

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "species" "PetSpecies";
