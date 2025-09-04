# TaxHacker – Full Project Documentation

## Overview

TaxHacker is a modern, AI-powered financial document management and transaction extraction platform. It is designed for accountants, business owners, and power users who need to automate the ingestion, categorization, and export of financial data from a variety of sources—including direct file upload, email polling, and bulk CSV import/export. The system is built with Next.js, React, TypeScript, Prisma, and Docker, and is designed for extensibility and integration with external accounting systems like QuickBooks Online.

---

## Core Features

- **Document Upload & AI Extraction:** Upload PDFs, images, or email attachments. The system uses LLMs to extract transaction data.
- **Unsorted Inbox:** Review, edit, and categorize extracted transactions. Preview images and AI-extracted fields are shown side-by-side.
- **Bulk Import/Export:** Import or export transactions via CSV, including mapping to QuickBooks Online journal entry format.
- **Vendor Management:** Tag vendors, manage payment methods, and associate vendors with default QB Account/Class.
- **QuickBooks Export:** Export transactions as journal entries for QuickBooks Online.
- **Email Poller:** A separate Node.js service (Dockerized) polls IMAP mailboxes, imports attachments, and creates transaction records.
- **Custom Fields:** Add, edit, or remove custom fields for transactions.
- **Settings UI:** Manage categories (QB Account), projects (QB Class), vendors, and more.

---

## Architecture

- **Frontend:** Next.js 15+, React 19, TypeScript, Tailwind CSS.
- **Backend:** Next.js API routes, Prisma ORM, PostgreSQL.
- **Email Poller:** Node.js 20, `node-imap`, `mailparser`, Prisma, Docker.
- **Deployment:** Docker Compose for multi-service orchestration.
- **Storage:** Uploaded files and email attachments are stored in a shared Docker volume.

---

## Directory Structure

- `app/` – Next.js app routes and pages.
- `components/` – React UI components.
- `models/` – Database access and business logic.
- `prisma/` – Prisma schema and migrations.
- `public/` – Static assets.
- `scripts/` – Utility scripts (e.g., email processor).
- `../email-poller/` – Standalone Node.js IMAP poller (Dockerized).

---

## Key Data Models

- **Transaction:** Core record, includes fields for QB Account (category) and QB Class (project).
- **Category:** Used as QB Account.
- **Project:** Used as QB Class.
- **Vendor:** Linked to transactions, supports payment method tagging.
- **File:** Uploaded or ingested document, linked to transactions.

---

## Major Modifications & Enhancements

- **QB Account and Class:** Category and Project fields are relabeled and used for QuickBooks mapping.
- **Bulk CSV Import/Export:** `/import/csv` allows mapping CSV columns to any field, including QB Account/Class.
- **QuickBooks Export:** UI dialog for selecting date range and filters, exports transactions as journal entries in QB-compatible CSV.
- **Email Poller Integration:** Node.js service polls IMAP, saves attachments, and creates transaction records in the main DB.
- **Vendor Mapping:** Vendors can be associated with default QB Account/Class for auto-tagging.
- **UI/UX:** Modern, responsive, and user-friendly interface for all workflows.

---

## Email Poller Functionality

- **Runs as a separate Docker service.**
- **Polls IMAP mailboxes** (Office365, Gmail, etc.) for new emails.
- **Parses emails and attachments** using `mailparser`.
- **Saves attachments** to the shared uploads directory.
- **Creates file and transaction records** in the main database.
- **Triggers AI extraction** by setting `cachedParseResult` to `null`.
- **Fully integrated with the main TaxHacker app** via shared DB and Docker volume.

---

## UI/UX for Exporting Transactions

- **Export Button:** On the Transactions page, click the "QuickBooks" export button.
- **Dialog:** Select date range (e.g., "Today", "This Month", or custom), filter by QB Account/Class if needed.
- **Export:** Click "Export Journal Entries" to download a CSV formatted for QuickBooks Online journal entry import.

---

## Running via Docker Compose

1. **Clone both repos** (TaxHacker and email-poller) to the server.
2. **Set up `.env` files** for both services with DB and IMAP credentials.
3. **From the TaxHacker directory:**
   ```
   docker-compose up -d --build
   ```
4. **Both the app and poller will run, sharing the database and uploads volume.**

### Email Poller Setup Notes

- Use the same uploads directory for both services by setting `UPLOAD_PATH=/app/data/uploads` and mounting `./data:/app/data` in docker-compose for the app and the poller.
- The poller stores files using the same convention as the app:
  - DB `files.path`: `unsorted/<uuid>.<ext>`
  - Disk path: `UPLOAD_PATH/<user.email>/unsorted/<uuid>.<ext>`
- Processed emails are marked as `\Seen` to avoid reprocessing.
- Only one ingestion path should be used in production: the standalone poller (docker service) or the in-app ingestion service. This fork defaults to the standalone poller.

---

## Development Files

- All source code is in your local VS Code workspace.
- Main app: `TaxHacker/`
- Email poller: `../email-poller/`
- Uploaded files: `TaxHacker/uploads/` (shared Docker volume)
- Data: `TaxHacker/data/` (shared Docker volume)

---

## GitHub & Deployment

- Push all changes to your GitHub fork.
- On the server, pull the latest code and run Docker Compose.
- If the email-poller repo is private, ensure SSH keys are set up and GitHub is in `known_hosts`.

---

## Complexities & Future Challenges

- **Field Mapping:** Adding/removing fields (especially for QB integration) may require DB migrations and UI updates.
- **Email Parsing:** Handling edge cases in email formats, attachments, and encoding can be complex.
- **AI Extraction:** LLMs may require prompt tuning or model upgrades for better accuracy.
- **Bulk Operations:** Large CSV imports/exports may hit memory or performance limits.
- **Vendor Mapping:** Keeping vendor-to-account/class mappings up to date as business rules evolve.
- **Docker Volumes:** Ensuring file permissions and volume mounts are consistent across environments.
- **Security:** Protecting sensitive data in `.env` files and Docker volumes.
- **Scaling:** For high volume, consider splitting services, using a message queue, or scaling DB/file storage.

---

## Handoff Checklist

- [x] All code and config in local workspace and GitHub fork.
- [x] Docker Compose setup for app, poller, and DB.
- [x] Email poller integration and documentation.
- [x] Bulk CSV import/export for QB Account/Class.
- [x] UI/UX for all major workflows.
- [x] README and full documentation provided.

---

## Contact & Support

- For further development, review this documentation and the codebase.
- For deployment or integration issues, check Docker logs and GitHub issues.
- For major changes, review the data model and Docker Compose setup.

---

**This document should be kept up to date as the project evolves.**
