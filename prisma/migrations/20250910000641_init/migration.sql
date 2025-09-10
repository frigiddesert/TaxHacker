/*
  Warnings:

  - You are about to drop the column `attachment_hashes` on the `email_ingestion_log` table. All the data in the column will be lost.
  - You are about to drop the column `vendor_id` on the `transactions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."transactions" DROP CONSTRAINT "transactions_vendor_id_fkey";

-- DropIndex
DROP INDEX "public"."transactions_vendor_id_idx";

-- AlterTable
ALTER TABLE "public"."email_ingestion_log" DROP COLUMN "attachment_hashes",
ADD COLUMN     "attachmentHashes" JSONB;

-- AlterTable
ALTER TABLE "public"."transactions" DROP COLUMN "vendor_id",
ADD COLUMN     "vendorId" UUID;

-- CreateIndex
CREATE INDEX "transactions_vendorId_idx" ON "public"."transactions"("vendorId");

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
