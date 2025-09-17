# Remediation Task List

## Critical
- [ ] Reinstate ESLint and TypeScript build enforcement in `next.config.ts` and resolve resulting issues.
- [ ] Consolidate IMAP email ingestion to sequential fetching shared across app routes and worker scripts to avoid multi-UID requests.
- [ ] Replace `getCurrentUser` usage in background/worker contexts with an explicit system account lookup to prevent redirects.

## High
- [ ] Rework `lib/simple-email-fetch.ts` to process all pending emails incrementally, respect the force flag, and avoid duplicate log inserts.
- [ ] Ensure processed-email moves verify UID validity when relocating messages in `scripts/email-processor.ts`.
- [ ] Standardize the automated test runner (Jest vs Vitest), fix configuration, and update tests accordingly.
- [ ] Remove the empty migration at `prisma/migrations/20250915225255_auto_dev/` or replace it with the intended DDL.

## Medium
- [ ] Replace bash-dependent database scripts with cross-platform commands in `package.json` and adjust `db:stop` behavior.
- [ ] Downgrade Docker base image from Node 23 to the latest 22.x LTS release.
- [ ] Align `scripts/package.json` dependencies with the root workspace to eliminate duplicate/outdated versions.
- [ ] Update `check-email-logs.js` to query existing tables or deprecate it if obsolete.
- [ ] Remove unused dependencies such as `esbuild` from `package.json`.
- [ ] Polish the email manual check UI copy in `components/email/manual-check-button.tsx`.
