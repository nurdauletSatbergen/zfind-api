-- DropForeignKey
ALTER TABLE "pets" DROP CONSTRAINT "pets_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_userId_fkey";

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
