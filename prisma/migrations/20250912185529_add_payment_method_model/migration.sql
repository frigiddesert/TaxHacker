-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "payment_method_code" TEXT;

-- CreateTable
CREATE TABLE "public"."payment_methods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_methods_user_id_idx" ON "public"."payment_methods"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_user_id_code_key" ON "public"."payment_methods"("user_id", "code");

-- CreateIndex
CREATE INDEX "transactions_payment_method_code_idx" ON "public"."transactions"("payment_method_code");

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_payment_method_code_user_id_fkey" FOREIGN KEY ("payment_method_code", "user_id") REFERENCES "public"."payment_methods"("code", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
