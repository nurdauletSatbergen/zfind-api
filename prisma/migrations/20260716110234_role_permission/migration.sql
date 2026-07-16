/*
  Warnings:

  - You are about to drop the `_PermissionsToRole` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_PermissionsToRole" DROP CONSTRAINT "_PermissionsToRole_A_fkey";

-- DropForeignKey
ALTER TABLE "_PermissionsToRole" DROP CONSTRAINT "_PermissionsToRole_B_fkey";

-- DropTable
DROP TABLE "_PermissionsToRole";

-- CreateTable
CREATE TABLE "_role_permissions" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_role_permissions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_role_permissions_B_index" ON "_role_permissions"("B");

-- AddForeignKey
ALTER TABLE "_role_permissions" ADD CONSTRAINT "_role_permissions_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_role_permissions" ADD CONSTRAINT "_role_permissions_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
