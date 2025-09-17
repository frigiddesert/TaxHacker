# TaxHacker Email Processing Handoff Document

## Current Status
The TaxHacker application is experiencing issues with email processing functionality. The dev server runs successfully, and the triage page loads, but email fetching from the IMAP server fails consistently.

## Problems Identified

### Primary Issue: IMAP FETCH Command Failure
- **Error**: `BAD Error in IMAP command FETCH: Invalid messageset`
- **Context**: Occurs when attempting to fetch multiple emails using comma-separated UIDs in a single FETCH command
- **Affected Server**: Dovecot IMAP server (mail.rimtours.com)
- **Impact**: Email processing returns 0 processed emails despite successfully connecting and finding 30 messages

### Secondary Issues Resolved
- **Database Connection**: Initially failing due to PostgreSQL not running; resolved by starting Docker Compose
- **Next.js Cache Corruption**: Triage page showing "loading emails" indefinitely without CSS; resolved by clearing .next directory
- **Deprecated Dependencies**: 'imap' package replaced with modern ImapFlow library

## What Has Been Tried

### Code Migration
- Replaced deprecated `imap` package with `imapflow` library
- Updated email fetching logic in `lib/simple-email-fetch.ts` to use ImapFlow API
- Maintained existing functionality while modernizing the implementation

### Server Configuration
- Verified IMAP server connection and authentication works correctly
- Confirmed server capabilities include UIDPLUS extension
- Tested with real credentials (accounting@rimtours.com)

### Build and Runtime Fixes
- Cleared Next.js build cache (.next directory)
- Restarted development server
- Verified database connectivity via Docker Compose

### Testing
- Confirmed API endpoint `/api/emails/check` receives requests
- Verified IMAP connection establishes successfully
- Observed UID SEARCH works and returns expected message UIDs
- Identified FETCH command as the failure point

## What Doesn't Work

### Batch UID FETCH Operations
```javascript
// This fails on Dovecot:
const messages = await this.client.fetch(`${last20Uids.join(',')}`, {
  uid: true,
  envelope: true,
  source: true,
  internalDate: true
});
```

**Error Response**: `Invalid messageset (0.001 + 0.000 secs).`

### Root Cause Analysis
The Dovecot IMAP server does not support comma-separated UID ranges in FETCH commands, despite advertising UIDPLUS capability. This is a server-specific limitation rather than a client code issue.

## Recommended Next Steps

### Immediate Fix: Implement Single UID Fetching
Modify `lib/simple-email-fetch.ts` to fetch emails individually in a loop:

```javascript
// Replace batch fetch with loop
const messages: any[] = [];
for (const uid of last20Uids) {
  try {
    const message = await this.client.fetchOne(uid, {
      uid: true,
      envelope: true,
      source: true,
      internalDate: true
    });
    if (message) {
      messages.push(message);
    }
  } catch (fetchError) {
    console.error(`Error fetching UID ${uid}:`, fetchError);
    // Handle individual fetch failures
  }
}
```

### Testing Strategy
1. Apply the single UID fetch modification
2. Test email processing functionality
3. Verify emails appear in triage page
4. Monitor for performance impact (sequential vs parallel fetching)

### Alternative Approaches to Consider
1. **Server Migration**: Evaluate moving to a more standards-compliant IMAP server
2. **Batch Optimization**: Implement parallel single fetches using Promise.all()
3. **Caching Strategy**: Cache fetched emails to reduce repeated IMAP calls
4. **Error Handling**: Improve error reporting for individual fetch failures

### Files to Focus On
- `lib/simple-email-fetch.ts`: Core email fetching logic
- `app/api/emails/check/route.ts`: API endpoint triggering email checks
- `app/(app)/triage/page.tsx`: Frontend component displaying emails

### Environment Setup
- Ensure PostgreSQL is running via `docker-compose up -d`
- Development server: `npm run dev`
- IMAP credentials configured for testing

## Priority
High: Fix email fetching to restore core functionality
Medium: Optimize performance of single UID fetches
Low: Consider server migration for better IMAP compliance