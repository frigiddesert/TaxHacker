# TaxHacker Development Handoff Document

## Overview
TaxHacker is a Next.js 15.5.2 application built for automated tax document processing and analysis. The application uses AI-powered document analysis to extract transaction data from PDFs and emails, with a focus on QuickBooks integration and automated workflow management.

## Architecture

### Technology Stack
- **Frontend**: Next.js 15.5.2 with Turbopack (development)
- **Backend**: Next.js API routes with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Custom authentication system
- **AI/LLM**: Multiple provider support (OpenAI, Google, Mistral)
- **File Processing**: ImageMagick, PDF parsing, email attachment handling
- **UI**: Tailwind CSS, Lucide icons, custom component library
- **Email**: IMAP integration for automated email processing

### Development Environment
- **Port**: Development server runs on port 7331
- **Commands**:
  - `npm run dev` - Start development server with Turbopack
  - `npx prisma studio` - Database management interface
  - `npx prisma migrate dev` - Apply database migrations
  - `npx prisma generate` - Generate Prisma client

### Deployment
- **Docker**: Application containerized with `docker-compose`
- **Image**: Uses `ghcr.io/vas3k/taxhacker:latest`
- **Note**: Local development changes won't appear in Docker without rebuilding the image

## Database Schema

### Core Models
1. **User** - User accounts and authentication
2. **File** - Uploaded documents (PDFs, emails, attachments)
3. **Transaction** - Processed financial transactions
4. **Category** - Chart of accounts (QB accounts imported here)
5. **Project** - QB classes for transaction classification
6. **PaymentMethod** - Payment types (ACH, Bill Pay, Autopay, etc.)
7. **Currency** - Multi-currency support
8. **Field** - Dynamic form field definitions
9. **Vendor** - Known billers/vendors for AI filtering
10. **Settings** - User-specific configuration

### Key Relationships
- Files can be processed into Transactions
- Transactions link to Categories (accounts), Projects (classes), and PaymentMethods
- Email metadata is stored in File.metadata for email-sourced documents

## File Structure

### Components (`/components`)
- `forms/` - Reusable form components (selects, inputs, validation)
- `files/` - File upload, preview, and management
- `unsorted/` - Document analysis and processing interface
- `email/` - Email processing and triage components
- `agents/` - AI tool components (currency converter, item detection)
- `ui/` - Base UI components (buttons, cards, alerts)

### Core Business Logic (`/lib`)
- `auth.ts` - Authentication and user management
- `db.ts` - Database connection
- `config.ts` - Application configuration
- `email-triage.ts` - Email classification and filtering
- `previews/` - PDF and image preview generation

### API Routes (`/app/api`)
- `emails/check/` - Manual email processing trigger
- File serving and preview endpoints

### Database Layer (`/models`)
- CRUD operations for all database entities
- Data validation and business logic

### Scripts (`/scripts`)
- `import-qb-to-categories.cjs` - Import QB chart of accounts
- `import-payment-methods.cjs` - Import payment method definitions
- `email-processor.ts` - Automated email processing

## Recent Major Changes (Commit 980f0d6)

### ✅ Completed Features

1. **PaymentMethod Model**
   - Added new database model for payment types
   - Migration: `20250912185529_add_payment_method_model`
   - 11 default payment methods imported (ACH, Bill Pay, Autopay, Check, Wire, Credit Card, Debit Card, Cash, PayPal, Venmo, Zelle)

2. **QB Chart of Accounts Integration**
   - 157 QB accounts imported into Category model
   - Import script: `scripts/import-qb-to-categories.cjs`
   - CSV source: `Rim RR, LLC_Account List.csv`
   - Accounts display as "Account Number - Account Name" in dropdowns

3. **Form Improvements**
   - Field labels updated: "Category" → "Account", "Project" → "Class"
   - Payment type dropdown enhanced with ACH, Billpay, Autopay options
   - Added payment method selection component
   - Unknown vendor detection and flagging

4. **PDF Processing Fixes**
   - Added iframe fallback in `components/files/preview.tsx`
   - Enhanced error handling in `lib/previews/generate.ts`
   - Direct file serving when ImageMagick conversion fails

5. **AI Analysis Debugging**
   - Enhanced logging in `ai/attachments.ts`
   - File path verification and existence checking
   - Detailed error reporting for analysis failures

## Current Issues & Known Problems

### 🔴 Critical Issues

1. **Email Headers Missing** (`app/(app)/unsorted/page.tsx:42`)
   - Email metadata not displaying in file analysis interface
   - Headers were previously visible but disappeared after recent changes
   - Check email detection logic in file processing pipeline

2. **AI Analysis File Retrieval** (`ai/attachments.ts`)
   - "No files available for AI analysis" error
   - File path resolution issues between database paths and filesystem
   - Debug logging added but root cause needs investigation

3. **File Location Issues**
   - Documents not being located for AI LLM API analysis
   - Potential path mismatch between stored paths and actual file locations
   - May be related to Docker vs local development environment differences

### 🟡 High Priority Tasks

1. **Automated Pay Date Calculation**
   - User requested: "pay on date" = due date - 5 days
   - Needs implementation in `components/unsorted/analyze-form.tsx`
   - Should integrate with AI-detected due dates

2. **Email Processing Pipeline**
   - Email attachment handling needs improvement
   - Content extraction from email bodies
   - Better integration with file analysis workflow

## Development Workflow & Testing Strategy

### For New Developer: Automated Testing Requirements

**CRITICAL**: Develop automated testing methods to eliminate manual verification steps. The previous workflow required too much human intervention:

❌ **Avoid These Manual Steps:**
- Running shell commands manually
- Monitoring verbose output manually  
- Using curl to test URLs manually
- Asking users to verify functionality
- Manual file uploads for testing

✅ **Implement These Automated Approaches:**

1. **Unit Tests**
   ```bash
   # Add comprehensive test suite
   npm install --save-dev jest @testing-library/react @testing-library/jest-dom
   ```

2. **Integration Tests**
   - Database operations testing
   - API endpoint validation
   - File upload and processing pipeline tests
   - Email processing workflow tests

3. **End-to-End Tests**
   - User journey automation (upload → analyze → save)
   - AI analysis pipeline testing
   - Form submission and validation

4. **Automated File Testing**
   - Create test fixture files (PDFs, emails)
   - Automated file analysis verification
   - Expected output validation

5. **Environment Consistency**
   - Docker development environment that matches production
   - Automated database seeding for testing
   - Mock AI service responses for reliable testing

### Code Quality Standards

1. **TypeScript Strict Mode**
   - All new code must have proper type definitions
   - No `any` types without justification
   - Interface definitions for all data structures

2. **Error Handling**
   - Comprehensive try-catch blocks
   - Meaningful error messages with context
   - Graceful fallbacks for external service failures

3. **Performance**
   - Efficient database queries (use Prisma query optimization)
   - Lazy loading for large file previews
   - Background processing for heavy operations

4. **Security**
   - Input validation for all user data
   - File upload restrictions and validation
   - API key protection and rotation support

## Configuration

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://...

# AI Providers (at least one required)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
MISTRAL_API_KEY=...

# Email Processing
EMAIL_HOST=imap.gmail.com
EMAIL_USER=...
EMAIL_PASSWORD=...
```

### Settings Model
User-specific settings stored in database:
- `default_currency` - Default transaction currency
- `default_type` - Default transaction type
- `default_project` - Default QB class
- `openai_api_key` - User's OpenAI key (if self-hosted)
- `google_api_key` - User's Google key (if self-hosted)
- `mistral_api_key` - User's Mistral key (if self-hosted)

## Debugging & Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Development server uses port 7331
   - Use `netstat -aon | findstr :7331` to find conflicting processes
   - Kill with `taskkill /F /PID [process_id]`

2. **Prisma Client Issues**
   - Run `npx prisma generate` after schema changes
   - Clear `node_modules/.prisma` if client is stale
   - Restart dev server after client regeneration

3. **PDF Processing Failures**
   - Check ImageMagick installation
   - Verify file permissions
   - Review error logs in `lib/previews/generate.ts`

4. **Email Processing Errors**
   - Check IMAP connection settings
   - Verify email credentials
   - Review email triage logs

### Development vs Production Differences

**IMPORTANT**: There's a known issue where local development changes don't appear in Docker because:
- Docker uses pre-built image `ghcr.io/vas3k/taxhacker:latest`
- Local file changes only affect local development server
- To see changes in Docker, image must be rebuilt

**Solution**: Develop locally with `npm run dev`, then rebuild Docker image for testing.

## Next Steps & Roadmap

### Immediate Priorities
1. Fix email header display issue
2. Resolve AI analysis file retrieval problems
3. Implement automated pay date calculation
4. Create comprehensive test suite

### Future Enhancements
- Bulk document processing
- Advanced AI model integration
- QuickBooks API direct integration
- Mobile app development
- Multi-user/organization support

## Support & Resources

### Useful Commands
```bash
# Start development environment
npm run dev

# Database management
npx prisma studio --port 5555

# Import QB accounts (if needed)
node scripts/import-qb-to-categories.cjs

# Import payment methods (if needed)
node scripts/import-payment-methods.cjs

# Check email processing
node scripts/email-processor.ts
```

### Documentation
- [Next.js 15 Docs](https://nextjs.org/docs)
- [Prisma ORM](https://www.prisma.io/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

---

**Document Created**: September 12, 2025  
**Last Commit**: 980f0d6 - "feat: Add PaymentMethod model, QB account imports, PDF fixes, and form improvements"  
**Development Status**: Active development with critical issues requiring immediate attention