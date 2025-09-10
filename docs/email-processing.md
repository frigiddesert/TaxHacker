# Email Processing System Documentation

## Overview

The TaxHacker email processing system automatically monitors and processes emails containing invoices and bills. It connects to an IMAP email server, identifies invoice-related emails, extracts attachments, and creates email previews for seamless integration into the invoice processing workflow.

## Architecture

```
IMAP Server → Email Processor → File Storage → Database → UI Display
     ↓              ↓              ↓            ↓         ↓
 mail.server  EmailIngestionService  data/uploads  PostgreSQL  /unsorted
```

## Key Components

### 1. EmailIngestionService Class
**Location:** `scripts/email-processor.ts`

Main service class that handles all email processing operations:

- **IMAP Connection Management**: Establishes secure connections to email servers
- **Email Filtering**: Identifies invoice-related emails using multiple criteria
- **Attachment Processing**: Extracts and stores PDF attachments
- **Email Preview Generation**: Creates text previews for email content
- **Vendor Matching**: Attempts to match emails to known vendors
- **Database Logging**: Tracks processing history and prevents duplicates

### 2. API Endpoint
**Location:** `app/(app)/api/email/check/route.ts`

RESTful endpoint for manual email checking:
- **Method**: POST `/api/email/check`
- **Authentication**: Requires user session
- **Response**: JSON with success/error status
- **Usage**: Triggered by "Check Emails Now" button in UI

### 3. UI Components

#### Manual Check Button
**Location:** `components/email/manual-check-button.tsx`
- Provides one-click email checking
- Shows loading states and success/error feedback
- Integrates with the `/unsorted` page workflow

#### Email Preview Component  
**Location:** `components/files/email-preview.tsx`
- Displays email metadata (sender, subject, date)
- Shows email content in a formatted view
- Distinguishes email files from PDF attachments

## Configuration

### Environment Variables

```env
# IMAP Server Configuration
EMAIL_INGESTION_HOST=mail.example.com          # IMAP server hostname
EMAIL_INGESTION_PORT=993                       # IMAP port (993 for SSL)
EMAIL_INGESTION_SECURE=true                    # Enable SSL/TLS
EMAIL_INGESTION_USER=accounting@company.com    # Email username
EMAIL_INGESTION_PASSWORD=app_password          # Email password
EMAIL_INGESTION_MAILBOX=INBOX                  # Mailbox to monitor
EMAIL_INGESTION_POLLING_INTERVAL=300000        # Polling interval (5 minutes)
EMAIL_INGESTION_FIRST_EMAIL_DATE=2025-01-01    # Start date for processing
```

### Docker Configuration

The email processing system runs within the Docker container and requires:
- Network access to IMAP servers
- Volume mounts for file storage
- Environment variable passthrough

## Email Processing Flow

### 1. Connection & Authentication
```typescript
const emailConfig = {
  host: process.env.EMAIL_INGESTION_HOST,
  port: parseInt(process.env.EMAIL_INGESTION_PORT),
  secure: process.env.EMAIL_INGESTION_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_INGESTION_USER,
    pass: process.env.EMAIL_INGESTION_PASSWORD
  }
};
```

### 2. Email Identification
The system identifies invoice-related emails using multiple criteria:

#### Vendor Matching
- Checks sender email against known vendor database
- Matches sender domain to vendor domains
- Uses case-insensitive matching for accuracy

#### Content Keywords
Scans email subject and content for invoice-related terms:
- "invoice", "bill", "statement", "payment"
- "due", "overdue", "outstanding"
- "receipt", "charge", "billing"

#### Attachment Detection
- Prioritizes emails with PDF attachments
- Common invoice attachment patterns
- File size and type validation

### 3. File Processing

#### PDF Attachments
```typescript
async saveAttachment(attachment: any, emailInfo: any): Promise<string> {
  // Generate unique filename with metadata
  const filename = `${emailInfo.date}_${vendor}_${attachment.filename}`;
  
  // Save to data/uploads directory
  const filePath = path.join(uploadPath, filename);
  await writeFile(filePath, attachment.content);
  
  // Create database record
  const fileRecord = await getPrismaClient().file.create({
    data: {
      userId: user.id,
      filename: attachment.filename,
      path: filePath,
      size: attachment.size,
      mime_type: attachment.contentType,
      metadata: {
        source: 'email',
        emailFrom: emailInfo.from,
        emailSubject: emailInfo.subject,
        emailDate: emailInfo.date,
        vendor: matchedVendor?.name
      }
    }
  });
  
  return fileRecord.id;
}
```

#### Email Previews
For emails without attachments or with important text content:
```typescript
async saveEmailPreview(parsedEmail: any, emailInfo: any): Promise<string> {
  // Extract and clean text content
  const emailContent = parsedEmail.text || parsedEmail.html;
  const cleanContent = this.cleanEmailContent(emailContent);
  
  // Create preview file
  const filename = `email_${emailInfo.date}_${emailInfo.from}.txt`;
  const filePath = path.join(uploadPath, filename);
  await writeFile(filePath, cleanContent, 'utf8');
  
  // Create database record with email metadata
  const fileRecord = await getPrismaClient().file.create({
    data: {
      userId: user.id,
      filename: filename,
      path: filePath,
      size: Buffer.byteLength(cleanContent, 'utf8'),
      mime_type: 'text/plain',
      metadata: {
        source: 'email',
        emailFrom: emailInfo.from,
        emailSubject: emailInfo.subject,
        emailDate: emailInfo.date,
        emailContent: cleanContent
      }
    }
  });
  
  return fileRecord.id;
}
```

### 4. Vendor Matching

The system attempts to match emails to known vendors:

```typescript
async findMatchingVendor(fromEmail: string, subject: string): Promise<Vendor | null> {
  const user = await getPrismaClient().user.findFirst();
  const vendors = await getPrismaClient().vendor.findMany({
    where: { userId: user.id, isActive: true }
  });
  
  // Extract domain and name from email
  const [emailName, emailDomain] = fromEmail.toLowerCase().split('@');
  
  for (const vendor of vendors) {
    const vendorName = vendor.name.toLowerCase();
    
    // Check for exact name match
    if (vendorName.includes(emailName) || emailName.includes(vendorName)) {
      return vendor;
    }
    
    // Check for domain match
    if (vendor.email && vendor.email.includes(emailDomain)) {
      return vendor;
    }
    
    // Check subject line for vendor name
    if (subject.toLowerCase().includes(vendorName)) {
      return vendor;
    }
  }
  
  return null;
}
```

### 5. Database Logging

Email processing is tracked to prevent duplicates:

```typescript
// Log processing attempt
await getPrismaClient().emailIngestionLog.create({
  data: {
    userId: user.id,
    emailUid: messageUid,
    emailFrom: fromEmail,
    emailSubject: subject,
    emailDate: new Date(messageDate),
    processed: false,
    createdAt: new Date()
  }
});

// Update on successful processing
await getPrismaClient().emailIngestionLog.update({
  where: { id: logRecord.id },
  data: {
    processed: true,
    fileId: fileRecord.id,
    processedAt: new Date()
  }
});
```

## User Interface Integration

### /unsorted Page Integration

The email processing integrates seamlessly with the existing `/unsorted` workflow:

1. **Manual Check Button**: Users can trigger email checks on demand
2. **Email Preview**: Email content displays inline with PDF previews
3. **Vendor Highlighting**: Unknown vendors are highlighted in orange
4. **Metadata Display**: Email source information is clearly shown

### File Type Detection

The system distinguishes between email and PDF files:

```typescript
// In components/files/preview.tsx
const isEmailFile = file.metadata && 
  typeof file.metadata === "object" && 
  "source" in file.metadata && 
  file.metadata.source === "email";

if (isEmailFile) {
  return <EmailPreview file={file} />;
}
```

### Email Preview Component

Displays email content with proper formatting:

```typescript
export function EmailPreview({ file }: EmailPreviewProps) {
  const metadata = file.metadata as any;
  
  return (
    <div className="email-preview">
      <div className="email-headers">
        <div><strong>From:</strong> {metadata.emailFrom}</div>
        <div><strong>Subject:</strong> {metadata.emailSubject}</div>
        <div><strong>Date:</strong> {formatDate(metadata.emailDate)}</div>
      </div>
      <div className="email-content">
        {metadata.emailContent}
      </div>
    </div>
  );
}
```

## Error Handling

### Connection Errors
- Automatic retry logic for transient failures
- Graceful degradation when email server is unavailable
- User-friendly error messages in UI

### Authentication Errors
- Clear error messages for invalid credentials
- Support for app-specific passwords
- Configuration validation

### Processing Errors
- Continues processing other emails if one fails
- Logs errors for debugging
- Maintains system stability

## Security Considerations

### Credential Management
- Email passwords stored in environment variables
- Support for app-specific passwords
- No credential logging or exposure

### File Storage
- Uploaded files stored in restricted directory
- Unique filenames prevent conflicts
- Size limits and type validation

### Access Control
- User-based isolation of email data
- Authentication required for all operations
- Vendor data privacy protection

## Monitoring & Debugging

### Logging
The system provides comprehensive logging:
- IMAP connection status
- Email processing results
- Error details and stack traces
- Performance metrics

### Database Tracking
- Complete audit trail of processed emails
- Processing timestamps and status
- File association tracking

## API Reference

### Manual Email Check
```
POST /api/email/check
Authorization: User session required

Response:
{
  "success": true,
  "message": "Email check completed successfully"
}

Error Response:
{
  "success": false,
  "error": "Connection not available"
}
```

### Email Processing Statistics
Email processing data is available through the database:
- `emailIngestionLog`: Processing history
- `files`: Created file records
- `vendors`: Vendor matching results

## Best Practices

### Configuration
1. Use app-specific passwords for email accounts
2. Set appropriate polling intervals (5-15 minutes)
3. Configure start dates to avoid processing old emails
4. Monitor disk space for file storage

### Maintenance
1. Regularly review processing logs
2. Update vendor database for better matching
3. Clean up old processed files as needed
4. Monitor email server connection health

### Troubleshooting
1. Check environment variable configuration
2. Verify email server connectivity
3. Review IMAP server logs
4. Test with manual email check button

## Future Enhancements

### Planned Features
- Automatic polling with configurable schedules
- Email filtering rules and whitelists
- Bulk processing capabilities
- Enhanced vendor detection algorithms
- Email forwarding integration
- Advanced content parsing

### Performance Optimizations
- Incremental processing from last check
- Parallel attachment processing
- Caching of vendor matches
- Optimized database queries

## Conclusion

The TaxHacker email processing system provides a robust, automated solution for ingesting invoice-related emails and integrating them into the invoice processing workflow. With comprehensive error handling, security measures, and user-friendly interfaces, it streamlines the accounts payable process while maintaining data integrity and user control.