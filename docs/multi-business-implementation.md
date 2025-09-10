# Multi-Business Implementation Plan

## Overview
Implement multi-tenant business support allowing accountants to manage multiple businesses with separate QuickBooks connections, email ingestion, and configurations.

## Database Schema Changes

### 1. Business Entity Model
```sql
model Business {
  id              String   @id @default(uuid()) @db.Uuid
  name            String
  description     String?
  logo            String?
  address         String?
  bankDetails     String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // User relationships
  ownerId         String   @db.Uuid
  owner           User     @relation("BusinessOwner", fields: [ownerId], references: [id])
  users           BusinessUser[] // Many-to-many with roles
  
  // Business-specific data
  settings        BusinessSetting[]
  categories      Category[]
  projects        Project[]
  fields          Field[]
  currencies      Currency[]
  vendors         Vendor[]
  transactions    Transaction[]
  files           File[]
  emailIngestion  BusinessEmailConfig?
  quickbooks      BusinessQuickBooksConfig?
  
  @@map("businesses")
}

model BusinessUser {
  id         String   @id @default(uuid()) @db.Uuid
  businessId String   @db.Uuid
  userId     String   @db.Uuid
  role       String   // "owner", "admin", "viewer", "editor"
  createdAt  DateTime @default(now())
  
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([businessId, userId])
  @@map("business_users")
}

model BusinessSetting {
  id         String   @id @default(uuid()) @db.Uuid
  businessId String   @db.Uuid
  code       String
  name       String
  description String?
  value      String?
  
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  @@unique([businessId, code])
  @@map("business_settings")
}

model BusinessEmailConfig {
  id                    String   @id @default(uuid()) @db.Uuid
  businessId            String   @unique @db.Uuid
  provider              String   // "imap", "microsoft_graph"
  
  // IMAP Configuration
  host                  String?
  port                  Int?
  secure                Boolean?
  username              String?
  password              String?  // Encrypted
  mailbox               String?
  
  // Microsoft Graph Configuration
  clientId              String?
  clientSecret          String?  // Encrypted
  tenantId              String?
  mailboxAddress        String?
  refreshToken          String?  // Encrypted
  
  // Common settings
  isActive              Boolean  @default(true)
  pollingInterval       Int      @default(300000) // 5 minutes
  firstEmailDate        DateTime?
  lastProcessedDate     DateTime?
  
  business              Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  @@map("business_email_configs")
}

model BusinessQuickBooksConfig {
  id              String   @id @default(uuid()) @db.Uuid
  businessId      String   @unique @db.Uuid
  companyId       String
  accessToken     String   // Encrypted
  refreshToken    String   // Encrypted
  tokenExpiresAt  DateTime
  isActive        Boolean  @default(true)
  realmId         String?
  baseUrl         String   // sandbox or production
  
  business        Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  @@map("business_quickbooks_configs")
}
```

### 2. Update Existing Models
```sql
// Add businessId to all existing business-specific models
model Transaction {
  // ... existing fields
  businessId String @db.Uuid
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  @@index([businessId])
}

model Category {
  // ... existing fields
  businessId String @db.Uuid
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  @@unique([businessId, code])
}

// Similar updates for Project, Field, File, Vendor, EmailIngestionLog, etc.
```

## Implementation Tasks

### Phase 1: Database & Core Architecture
1. **Database Migration**
   - Create Business table and related models
   - Add businessId foreign keys to existing tables
   - Create migration scripts for existing data
   - Add proper indexes and constraints

2. **Business Context System**
   - Create BusinessContext provider for React
   - Implement business switching logic
   - Add middleware for business access control
   - Update authentication to include business selection

3. **Business Management API**
   - Create CRUD endpoints for businesses
   - Business user invitation system
   - Role-based access control
   - Business settings management

### Phase 2: Email Integration
4. **Microsoft Graph API Integration**
   - OAuth 2.0 authentication flow
   - Email reading via Graph API
   - Attachment downloading
   - Real-time webhook subscriptions (optional)
   - Token refresh handling

5. **Multi-Provider Email System**
   - Abstract email provider interface
   - IMAP provider (existing)
   - Microsoft Graph provider (new)
   - Business-specific email configuration
   - Separate email processing per business

6. **Email Configuration UI**
   - Business email setup wizard
   - Provider selection (IMAP vs Microsoft Graph)
   - OAuth flow for Microsoft 365
   - Connection testing and validation

### Phase 3: QuickBooks Integration
7. **Multi-Business QuickBooks**
   - Separate QB connections per business
   - Business-specific QB authentication
   - Company selection during QB setup
   - Token management per business

8. **QB API Abstraction**
   - Business-aware QB service layer
   - Automatic business context in QB calls
   - Error handling for multiple connections
   - Batch operations per business

### Phase 4: UI/UX Implementation
9. **Business Switching UI**
   - Business selector dropdown in header
   - Business creation modal
   - Business settings pages
   - User invitation system

10. **Business Management Pages**
    - `/businesses` - list all accessible businesses
    - `/businesses/new` - create new business
    - `/businesses/:id/settings` - business configuration
    - `/businesses/:id/users` - manage business users
    - `/businesses/:id/integrations` - email/QB setup

11. **Context-Aware Components**
    - Update all forms to include business context
    - Business-specific data filtering
    - Navigation updates with business info
    - Breadcrumb with business name

### Phase 5: Security & Performance
12. **Access Control**
    - Business-level permissions
    - API endpoint protection
    - Data isolation between businesses
    - Audit logging

13. **Performance Optimization**
    - Business-specific caching
    - Efficient business switching
    - Database query optimization
    - Lazy loading of business data

## Technical Implementation Details

### Business Context Provider
```typescript
// contexts/BusinessContext.tsx
interface BusinessContextType {
  currentBusiness: Business | null
  businesses: Business[]
  switchBusiness: (businessId: string) => void
  createBusiness: (data: CreateBusinessData) => Promise<Business>
  isLoading: boolean
}

const BusinessContext = createContext<BusinessContextType>()
```

### Microsoft Graph Integration
```typescript
// lib/email-providers/microsoft-graph.ts
class MicrosoftGraphProvider implements EmailProvider {
  async authenticate(clientId: string, tenantId: string): Promise<AuthResult>
  async getEmails(config: BusinessEmailConfig): Promise<Email[]>
  async downloadAttachment(emailId: string, attachmentId: string): Promise<Buffer>
}
```

### Business Middleware
```typescript
// middleware/business-context.ts
export async function withBusinessContext(
  req: NextRequest,
  businessId: string
): Promise<Business | null> {
  // Validate user has access to business
  // Set business context for request
}
```

## Migration Strategy

### Data Migration
1. Create default business for existing users
2. Move all existing data to default business
3. Update all queries to include business context
4. Test data isolation thoroughly

### Feature Rollout
1. Phase 1: Core architecture (no UI changes)
2. Phase 2: Business switching UI
3. Phase 3: Microsoft Graph integration
4. Phase 4: Multi-QB support
5. Phase 5: Full multi-tenant features

## Configuration Examples

### Microsoft 365 Business Setup
```yaml
email_config:
  provider: "microsoft_graph"
  client_id: "your-app-client-id"
  tenant_id: "your-tenant-id"
  mailbox_address: "accounting@company.com"
  scopes:
    - "https://graph.microsoft.com/Mail.Read"
    - "https://graph.microsoft.com/Mail.Read.Shared"
```

### QuickBooks Multi-Business
```yaml
quickbooks_configs:
  business_1:
    company_id: "123456"
    realm_id: "abc123"
    base_url: "https://quickbooks-api.intuit.com"
  business_2:
    company_id: "789012"
    realm_id: "def456"
    base_url: "https://quickbooks-api.intuit.com"
```

## Testing Requirements

1. **Unit Tests**
   - Business context switching
   - Email provider abstraction
   - Access control logic

2. **Integration Tests**
   - Microsoft Graph API integration
   - QuickBooks multi-business flows
   - Email processing per business

3. **E2E Tests**
   - Complete business setup workflow
   - Business switching scenarios
   - Multi-user access scenarios

## Security Considerations

1. **Data Isolation**
   - Strict business-level data separation
   - No cross-business data leakage
   - Proper query filtering

2. **Token Management**
   - Encrypted storage of OAuth tokens
   - Automatic token refresh
   - Secure token exchange

3. **Access Control**
   - Role-based permissions
   - Business membership validation
   - API endpoint protection

This implementation will provide a robust multi-tenant system suitable for accounting firms managing multiple client businesses.