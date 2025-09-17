# Remediation Task List

**Customer Goal:** keep the fork focused on reliable, automated email ingestion and document triage so an accountant can trust the AI pipeline without manual babysitting.

## Critical
- [x] Reinstate ESLint and TypeScript build enforcement in `next.config.ts` and resolve resulting issues.
- [x] Consolidate IMAP email ingestion to sequential fetching shared across app routes and worker scripts to avoid multi-UID requests.
- [x] Replace `getCurrentUser` usage in background/worker contexts with an explicit system account lookup to prevent redirects.

## High
- [x] Rework `lib/simple-email-fetch.ts` to process all pending emails incrementally, respect the force flag, and avoid duplicate log inserts.
- [x] Ensure processed-email moves verify UID validity when relocating messages in `scripts/email-processor.ts`.
- [ ] Standardize the automated test runner (Jest) and get the suite passing (attachments spec currently skipped/failing; `loadAttachmentsForAI` needs deterministic mocks).
- [x] Remove the empty migration at `prisma/migrations/20250915225255_auto_dev/` or replace it with the intended DDL.

## Medium
- [x] Replace bash-dependent database scripts with cross-platform commands in `package.json` and adjust `db:stop` behavior.
- [x] Downgrade Docker base image from Node 23 to the latest 22.x LTS release.
- [x] Align `scripts/package.json` dependencies with the root workspace to eliminate duplicate/outdated versions.
- [x] Update `check-email-logs.js` to query existing tables or deprecate it if obsolete.
- [x] Remove unused dependencies such as `esbuild` from `package.json`.
- [x] Polish the email manual check UI copy in `components/email/manual-check-button.tsx`.
- [ ] Trim noisy logging in `ai/attachments.ts` (or gate behind `NODE_ENV`) once tests cover the codepath.

## Next Steps
- Stabilise Jest by fixing the attachments test and verifying `npm test` passes without skips.
- Decide on keeping or removing the verbose logging in `ai/attachments.ts` before pushing.
- Stage intentional changes, create a feature branch (e.g. `handoff/email-refactor`), and commit before pushing to GitHub.
