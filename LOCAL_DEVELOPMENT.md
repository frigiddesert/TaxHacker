# TaxHacker Local Development Setup

This guide will help you set up TaxHacker for local development with email processing and QuickBooks integration.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ 
- npm or yarn

### Automatic Setup
```bash
# Run the setup script
./dev-setup.sh

# Start development server
npm run dev
```

Visit http://localhost:7331

## Manual Setup

### 1. Environment Configuration
```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env  # or your preferred editor
```

Key settings to configure:
- **AI API Keys**: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `MISTRAL_API_KEY`
- **Email Processing**: `EMAIL_INGESTION_*` settings
- **QuickBooks**: `QBO_*` settings (optional)

### 2. Database Setup
```bash
# Start PostgreSQL
docker-compose -f docker-compose.dev.yml up -d postgres

# Run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate
```

### 3. Start Development
```bash
# Option 1: Local Node.js server (recommended for development)
npm run dev

# Option 2: Docker container (closer to production)
docker-compose -f docker-compose.dev.yml up app
```

## Email Processing Setup

### IMAP Configuration
Configure these variables in `.env`:

```env
EMAIL_INGESTION_HOST=imap.gmail.com
EMAIL_INGESTION_PORT=993
EMAIL_INGESTION_SECURE=true
EMAIL_INGESTION_USER=your-email@domain.com
EMAIL_INGESTION_PASSWORD=your-app-password
EMAIL_INGESTION_MAILBOX=INBOX
EMAIL_INGESTION_FIRST_EMAIL_DATE=2025-01-01
```

### Testing Email Processing

1. **Manual Check**: Visit `/unsorted` and click "Check Emails Now"
2. **CLI Testing**: 
   ```bash
   npm run email:headers  # View recent email headers
   npm run email:check    # Process emails once
   ```
3. **View Results**: Check `/unsorted` for newly processed emails

### Email Processing Flow
1. Email processor connects to IMAP server
2. Scans for emails from `FIRST_EMAIL_DATE` forward
3. Identifies invoice-related emails using:
   - Known vendor matching (email/domain/keywords)
   - Content keywords ("invoice", "bill", "payment", etc.)
   - PDF attachments
4. Extracts attachments and saves to `/unsorted`
5. Creates email preview for text-based emails
6. Files appear in `/unsorted` page for AI processing

## Features Overview

### Email Integration
- **Email Preview**: Text emails show sender, subject, date, and content
- **PDF Processing**: PDF attachments extracted and processed normally
- **Vendor Matching**: Unknown vendors highlighted in orange
- **Manual Check**: Button to trigger email processing on demand

### Custom Fields
- **PayType**: ACH, BillPay, Auto, Manual dropdown field
- **Auto-created**: PayType field created automatically for all users

### QuickBooks Integration
- OAuth flow with CSRF protection
- Bill creation API
- Vendor management
- Account and Class mapping

## Database Management

```bash
# View database in browser
npm run db:studio

# Reset database (careful!)
npm run db:reset

# Create new migration
npx prisma migrate dev --name your-migration-name
```

Access database directly:
- **URL**: `postgresql://postgres:postgres@localhost:5432/taxhacker`
- **Adminer**: http://localhost:8080 (when running Docker)

## Docker Development

### Development Stack
```bash
# Start everything
docker-compose -f docker-compose.dev.yml up

# Start specific services
docker-compose -f docker-compose.dev.yml up postgres app
docker-compose -f docker-compose.dev.yml up postgres  # DB only
```

### Production Testing
```bash
# Build and test production image locally
docker-compose -f docker-compose.yml up --build
```

## Troubleshooting

### Email Issues
- **IMAP Connection Failed**: Check credentials and server settings
- **No Emails Found**: Verify `EMAIL_INGESTION_FIRST_EMAIL_DATE` is not too recent
- **Authentication Error**: Use app-specific password for Gmail/Outlook

### Database Issues
- **Connection Refused**: Ensure PostgreSQL is running (`docker-compose up postgres`)
- **Migration Failed**: Check if database exists and is accessible
- **Schema Out of Sync**: Run `npx prisma db push` to sync

### Build Issues
- **TypeScript Errors**: Run `npm run db:generate` to regenerate Prisma client
- **Missing Dependencies**: Delete `node_modules` and run `npm install`

## Project Structure

```
├── app/                          # Next.js app directory
│   ├── (app)/                   # Main application routes
│   │   ├── unsorted/            # File processing page
│   │   ├── api/email/check/     # Email processing API
│   │   └── files/raw/[id]/      # Raw file content endpoint
├── components/
│   ├── email/                   # Email-related components
│   ├── files/                   # File preview components
│   └── unsorted/                # Unsorted page components
├── scripts/
│   ├── email-processor.ts       # Main email processing logic
│   ├── imap-headers.ts         # Email testing utility
│   └── README.md               # Email processing docs
├── lib/
│   ├── config.ts               # Environment configuration
│   └── create-default-fields.ts # Auto-create custom fields
├── models/                      # Database models
├── docker-compose.dev.yml       # Development Docker setup
├── docker-compose.yml          # Production Docker setup
└── dev-setup.sh               # Automated setup script
```

## Next Steps

1. **Configure Email**: Set up IMAP credentials and test email processing
2. **Add Vendors**: Create vendor records for automatic email matching
3. **QuickBooks Setup**: Configure OAuth for bill creation (optional)
4. **Customize Fields**: Add custom fields for your specific needs

For more details, see:
- [Email Processing Guide](./scripts/README.md)
- [QuickBooks Workflow](./enhanced-qbo-workflow.md)
- [Vendor Management](./enhanced-vendor-design.md)