# Project Checkpoint — 2025-09-07

This checkpoint summarizes current functionality, changes shipped, how to resume work, and the next priorities.

## Status Summary
- QuickBooks Online (QBO) integration:
  - OAuth2 endpoints: `/qb/connect`, `/qb/callback`, `/qb/webhook`, `/qb/disconnect`.
  - Token storage/refresh (in `app_data`).
  - Bills API + batch “Send to QuickBooks” with progress.
  - Settings page `/settings/qbo` (connect status, COA/classes import from files).
- Vendors:
  - Prisma model + `Transaction.vendorId` relation.
  - Vendor defaults (QB Account/Category, QB Class/Project) and matching fields (from emails/domains/keywords).
  - Vendors settings UI extended to edit defaults + matching.
- Payables app:
  - `/apps/payables` shows summary by payment method and exports CSVs (all/bill_pay/ach/autopay).
- IMAP ingestion:
  - Stateful dedup via `email_ingestion_log` (unique on userId/mailbox/uidValidity/uid).
  - In-app and standalone poller both process UID ranges, idempotent, log status and attachment hashes.
  - Conservative ingestion (known vendor first; requires PDF; small LLM fallback only in app service).
- IMAP classifier CLI:
  - `TaxHacker/scripts/imap-classify.ts` scans last N days, logs each message (sender, subject, PDF, LLM decision & confidence) to `logs/*.jsonl` (gitignored).
- Proxy/Authelia support:
  - Unauthenticated routes: `/health`, `/qb/callback`, `/qb/webhook`.
  - `TRUST_PROXY_AUTH_HEADERS` env to accept `Remote-*` headers behind Caddy.
- Local Docker:
  - `docker-compose.local.yml` for app + Postgres; mounts `./config` for COA/classes import.

## Recent Changes (Key Files)
- QBO client & routes: `lib/qbo.ts`, `app/qb/*`, `app/(app)/qb/send-bills/route.ts`, `app/(app)/settings/qbo/*`.
- Vendors: `prisma/schema.prisma` (Vendor), `models/vendors.ts`, `components/settings/vendor-list.tsx`.
- Payables app: `app/(app)/apps/payables/*`.
- IMAP ingestion (idempotent): `lib/email-ingestion.ts`, `scripts/email-processor.ts`, `prisma/schema.prisma` (EmailIngestionLog).
- CLI tools: `scripts/qbo-cli.ts`, `scripts/imap-classify.ts`.
- Docs & config: `.gitignore` (logs, envs), README updates, local compose.

## How To Resume

### 1) Environment
- Root env files (one place):
  - `TaxHacker/.env.sandbox` for development
  - `TaxHacker/.env.production` for production
- Include at least:
  - QBO: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENV`, `QBO_SCOPES`
  - IMAP: `EMAIL_INGESTION_HOST|PORT|SECURE|USER|PASSWORD|MAILBOX|POLLING_INTERVAL`
  - LLM: `OPENAI_API_KEY`, `OPENAI_MODEL_NAME`

### 2) Database
```
npx prisma generate && npx prisma migrate dev
```

### 3) Run the app (dev)
```
npm install
npm run dev
# open http://localhost:7331
```

### 4) QBO OAuth (Development environment)
- In Intuit Developer portal (Development keys), add redirect URI exactly:
  - `http://localhost:7331/qb/callback`
- In `.env.sandbox` set:
  - `QBO_REDIRECT_URI=http://localhost:7331/qb/callback`
  - `QBO_SCOPES="com.intuit.quickbooks.accounting"`
- Generate the OAuth URL and complete consent:
```
cd TaxHacker/scripts
npx ts-node qbo-cli.ts --env sandbox auth-url
# open the printed URL, sign in; callback lands on localhost
```
- Verify in app: open `/settings/qbo` and check status “Connected” with Realm ID.

### 5) IMAP classifier (review last 30 days)
- Ensure IMAP creds are set in `.env.sandbox`.
```
cd TaxHacker/scripts
npx ts-node imap-classify.ts --env sandbox --days 30
# Console prints summaries; verbose JSONL written to TaxHacker/logs/
```

## Next Priorities
- QBO dry-run preview: dialog to preview Bills payload before posting.
- Payables checklist polish: bank-friendly “ACH/Check” checklists with print/export.
- IMAP enhancements (optional): add retry job for `email_ingestion_log.status=error`; optional move/keyword after success.
- Tests & logging: unit tests for vendor matcher, LLM classifier, QBO client (mocked); structured logs.

## Quick Commands
```
# Dev server
npm run dev

# Prisma
npx prisma generate && npx prisma migrate dev

# QBO OAuth URL (sandbox)
cd TaxHacker/scripts
npx ts-node qbo-cli.ts --env sandbox auth-url

# IMAP classifier (30 days)
npx ts-node imap-classify.ts --env sandbox --days 30
```

---

This checkpoint captures the current implementation status and how to quickly get back to a working environment.

