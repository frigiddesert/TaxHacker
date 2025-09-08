-- CreateTable
CREATE TABLE "email_ingestion_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mailbox" TEXT NOT NULL,
    "uid_validity" BIGINT NOT NULL,
    "uid" INTEGER NOT NULL,
    "message_id" TEXT,
    "internal_date" TIMESTAMP(3),
    "from" TEXT,
    "subject" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "attachment_hashes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_ingestion_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_ingestion_unique" ON "email_ingestion_log"("user_id", "mailbox", "uid_validity", "uid");

-- CreateIndex
CREATE INDEX "email_ingestion_log_user_id_idx" ON "email_ingestion_log"("user_id");

-- AddForeignKey
ALTER TABLE "email_ingestion_log" ADD CONSTRAINT "email_ingestion_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

