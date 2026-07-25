/*
  Warnings:

  - You are about to drop the column `visability` on the `files` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "files" DROP COLUMN "visability",
ADD COLUMN     "visibility" "FileVisibility" NOT NULL DEFAULT 'PUBLIC';
