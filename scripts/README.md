# TaxHacker Email Processor

This is a standalone email processor for the TaxHacker application that runs in a separate container/environment from the main application.

## Overview

The email processor:
1. Connects to an IMAP email account
2. Polls for new emails at regular intervals
3. Identifies invoice-related emails
4. Extracts PDF attachments
5. Saves files to the TaxHacker file system
6. Creates database records for the files
7. Integrates with the existing AI pipeline for invoice processing

## Prerequisites

- Node.js 20.x
- Access to the same PostgreSQL database as the main TaxHacker application
- IMAP email account credentials

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the Prisma schema from the main application:
   ```bash
   cp ../prisma/schema.prisma ./prisma/
   ```

3. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

## Configuration

Create a `.env` file with the following environment variables:

```env
# Database connection (should match the main TaxHacker application)
DATABASE_URL=postgresql://user:password@host:port/database

# IMAP configuration
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=your-email@example.com
IMAP_PASS=your-app-password
IMAP_MAILBOX=INBOX
IMAP_POLLING_INTERVAL=300000

# File storage directory (should match the main TaxHacker application)
UPLOADS_DIR=/path/to/taxhacker/uploads
```

## Running the Processor

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## How It Works

1. The processor connects to the IMAP server using the provided credentials
2. It polls the mailbox at the configured interval
3. For each unseen email:
   - Parses the email content and attachments
   - Checks if it's likely an invoice (based on keywords and PDF attachments)
   - If it is an invoice:
     - Saves PDF attachments to the file system
     - Creates database records for the files
     - Marks the email as seen
4. The main TaxHacker application will detect the new files and process them through the AI pipeline

## Integration with AI Pipeline

The email processor saves files to the same file system and database structure used by the main TaxHacker application. This means:

1. New files will automatically appear in the "Unsorted" section of the TaxHacker UI
2. The existing AI processing pipeline will process these files as usual
3. Users can review and categorize the extracted invoice data through the normal workflow

The email processor marks files for AI processing by setting `cachedParseResult` to `null` in the database. This triggers the AI analysis in the main application when users view the "Unsorted" page or click the "Analyze" button.

## Security Considerations

- Never commit the `.env` file with credentials to version control
- Use app-specific passwords for IMAP authentication
- Ensure the database connection uses SSL/TLS
- Restrict file system permissions for the uploads directory

---

# QuickBooks CLI Tester

A small CLI to test QuickBooks OAuth and API calls without the web app.

## Setup

1. From repository root, create environment files:

   - `.env.sandbox` (copy from `.env.sandbox.example`)
   - `.env.production` (copy from `.env.production.example`)

   Fill `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, and `QBO_ENV` accordingly.

2. Install dependencies in `scripts/`:

   ```bash
   cd scripts
   npm install
   ```

## Commands

Run all commands from `TaxHacker/scripts` directory.

```bash
# Show the QuickBooks OAuth URL (sandbox)
npx ts-node qbo-cli.ts --env sandbox auth-url

# Exchange code for tokens (paste code and realmId from redirect)
npx ts-node qbo-cli.ts --env sandbox exchange --code <code> --realmId <realm-id>

# Refresh tokens
npx ts-node qbo-cli.ts --env sandbox refresh --refresh-token <refresh-token>

# Query accounts
npx ts-node qbo-cli.ts --env sandbox query-accounts --access-token <access-token> --realmId <realm-id>

# Create a simple Bill
npx ts-node qbo-cli.ts --env sandbox create-bill \
  --access-token <access-token> \
  --realmId <realm-id> \
  --vendor "Acme, Inc" \
  --amount 12.34 \
  --account "Office Supplies" \
  --class "HQ" \
  --date 2025-09-01 \
  --memo "Test Bill"
```

Notes:
- The CLI picks `.env.sandbox` or `.env.production` automatically with `--env sandbox|production`.
- Use the web app’s `/qb/connect` to authorize once, then paste the `code` and `realmId` into the CLI `exchange` command if you want to test tokens manually.
