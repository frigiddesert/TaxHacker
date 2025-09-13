-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "pay_type" TEXT,
ADD COLUMN     "qb_account_id" UUID;

-- CreateTable
CREATE TABLE "public"."companies" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tax_id" TEXT,
    "qb_company_file" TEXT,
    "imap_host" TEXT,
    "imap_port" INTEGER,
    "imap_user" TEXT,
    "imap_password" TEXT,
    "imap_secure" BOOLEAN DEFAULT true,
    "s3_bucket_name" TEXT,
    "s3_region" TEXT,
    "s3_access_key_id" TEXT,
    "s3_secret_access_key" TEXT,
    "s3_endpoint" TEXT,
    "use_local_storage" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- Insert default company
INSERT INTO "public"."companies" ("id", "name", "updated_at") VALUES ('default', 'Default Company', CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "public"."qb_accounts" (
    "id" UUID NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "account_number" TEXT,
    "full_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail_type" TEXT NOT NULL,
    "description" TEXT,
    "balance" DECIMAL(15,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qb_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qb_accounts_company_id_idx" ON "public"."qb_accounts"("company_id");

-- CreateIndex
CREATE INDEX "qb_accounts_user_id_idx" ON "public"."qb_accounts"("user_id");

-- CreateIndex
CREATE INDEX "qb_accounts_type_idx" ON "public"."qb_accounts"("type");

-- CreateIndex
CREATE UNIQUE INDEX "qb_account_unique" ON "public"."qb_accounts"("company_id", "account_number");

-- CreateIndex
CREATE INDEX "transactions_qb_account_id_idx" ON "public"."transactions"("qb_account_id");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_qb_account_id_fkey" FOREIGN KEY ("qb_account_id") REFERENCES "public"."qb_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."qb_accounts" ADD CONSTRAINT "qb_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."qb_accounts" ADD CONSTRAINT "qb_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
