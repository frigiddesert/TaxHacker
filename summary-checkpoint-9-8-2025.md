Summary Checkpoint — 2025-09-08

Project: TaxHacker (Next.js + Prisma + QBO)

Local Folder
- Path: /mnt/c/users/EricBakken/VS Code Projects/taxhacker/TaxHacker

What’s Complete
- QuickBooks OAuth
  - /qb/connect implements CSRF state cookie and redirects to Intuit.
  - /qb/callback validates state, exchanges code, stores tokens in app_data.
  - Webhook verifier implemented at /qb/webhook.
  - Settings → QuickBooks shows connection status and realmId.
  - Developer fallback: paste token JSON form to save tokens if needed.
- Proxy/Caddy Integration
  - Caddy snippet prepared to bypass Authelia for /qb/callback and /qb/webhook.
  - Verified flow for bookkeeper.sandland.us domain.
- Server Deployment (pct103root)
  - Synced repo to ~/bookkeeper/TaxHacker.
  - Installed Node 20 + PM2.
  - Provisioned Postgres via Docker (127.0.0.1:5433, db: taxhacker).
  - Generated Prisma client; fixed schema relations (User.vendors and User.emailIngestionLogs).
  - Built app; fixed Next 15 type constraints (binary response bodies, Stripe API version, form action types).
  - Started with PM2 on PORT=8080; Prisma migrations applied; health endpoint returns 200.
- Email Processor groundwork
  - Hardened email ingestion scripts (safer mailbox access, typed buffers, JSON fields).
  - Optional, not running as a service yet.

What’s Left To Do
- Configure Intuit app (ensure redirect URI matches exactly; sandbox vs production as needed).
- Confirm OAuth end-to-end from Settings → QuickBooks → Connect → approve → Connected.
- Remove the developer token form once OAuth is confirmed stable (optional).
- Provide RESEND_API_KEY or leave email sending disabled (we now guard against missing key).
- Review remaining TypeScript warnings later (non-blocking) and harden vendor UI typing.
- Optional: set up a systemd service/PM2 process for the email-processor if you want automated IMAP ingestion.

Operational Notes
- App URL: https://bookkeeper.sandland.us (proxied by Caddy/Authelia; /qb/* bypassed).
- App process: pm2 status taxhacker; logs: pm2 logs taxhacker.
- Env: ~/bookkeeper/TaxHacker/.env (copied from .env.production). PORT=8080, TRUST_PROXY_AUTH_HEADERS=true, DATABASE_URL points to Docker PG on 5433.
- DB container: docker ps | grep taxhacker-pg; password stored in DB URL.

Next Steps
- Run OAuth connect and verify QBO access (list accounts, create bill via UI/endpoint).
- Optionally, integrate scheduled email ingestion.

Automation Options
- GitHub Action (scheduled daily): generate/update summary file, commit, and create a checkpoint tag.
- Local script: single command to append daily progress, build the summary, and tag a release checkpoint.

