# Enhanced Vendor Management Design

## Database Changes Needed

### 1. Update Vendor Model
```prisma
model Vendor {
  id                 String       @id @default(uuid()) @db.Uuid
  userId             String       @map("user_id") @db.Uuid
  user               User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  name               String
  payType            String       @map("pay_type") // NEW: "ACH", "Billpay", "Auto" 
  paymentMethod      String       // Keep for backward compatibility 
  bankDetails        String?
  contactEmail       String?      // ENHANCED: Primary contact email
  contactPhone       String?
  notes              String?
  isActive           Boolean      @default(true) @map("is_active")
  defaultCategoryCode String?     // RENAME to defaultAccountCode
  defaultProjectCode String?      // RENAME to defaultClassCode  
  fromEmails         Json?        // ["billing@vendor.com", ...] - for email matching
  fromDomains        Json?        // ["vendor.com", ...] - for email matching
  subjectKeywords    Json?        // ["invoice", "bill", ...] - for email matching
  createdAt          DateTime     @default(now()) @map("created_at")
  transactions       Transaction[]

  @@index([userId])
  @@map("vendors")
}
```

## UX Flow Design

### 1. Email Processing Workflow
```
Email Received → Vendor Matching → /unsorted Preview → AI Analysis → Transaction
```

### 2. Email Preview at /unsorted
- **PDF Attachment**: Show PDF preview pane (existing)
- **No PDF**: Show email headers + body preview  
- **AI Button**: "Analyze with AI" (existing workflow)

### 3. Vendor Auto-Creation from Email
When AI processes an email, extract:
- `name`: From sender name or email domain
- `contactEmail`: From "From" header
- `payType`: Default to "Manual" (user can change)
- `fromEmails`: Add the sender email automatically
- `fromDomains`: Add the domain automatically

### 4. Enhanced Vendor Management UI
- Add "Pay Type" dropdown: ACH, Billpay, Auto
- Show email matching rules in vendor settings
- Allow adding/editing email patterns for vendor matching

## Email Matching Logic Enhancement

### Current Logic (from email-processor.ts):
```typescript
// 1. Check fromEmails array for exact match
// 2. Check fromDomains array for domain match  
// 3. Check subjectKeywords for subject match
// 4. Fallback: keyword + PDF attachment required
```

### Enhanced Logic:
```typescript
function matchVendor(email: ParsedEmail, vendors: Vendor[]): Vendor | null {
  const fromAddresses = email.from.map(f => f.address.toLowerCase())
  const domains = fromAddresses.map(addr => addr.split('@')[1])
  const subject = email.subject?.toLowerCase() || ''
  
  for (const vendor of vendors) {
    // Exact email match (highest priority)
    if (vendor.fromEmails?.some(e => fromAddresses.includes(e.toLowerCase()))) {
      return vendor
    }
    
    // Domain match
    if (vendor.fromDomains?.some(d => domains.includes(d.toLowerCase()))) {
      return vendor  
    }
    
    // Subject keyword match
    if (vendor.subjectKeywords?.some(k => subject.includes(k.toLowerCase()))) {
      return vendor
    }
  }
  
  return null // No vendor match - use fallback keyword detection
}
```

## Terminology Updates

### Database Field Renames:
- `categories` table → rename to `accounts` 
- `projects` table → rename to `classes`
- `Transaction.categoryCode` → `Transaction.accountCode`
- `Transaction.projectCode` → `Transaction.classCode`

### UI Label Changes:
- "Category" → "Account" 
- "Project" → "Class"

## Implementation Priority:

1. **Phase 1**: Add payType field to Vendor model
2. **Phase 2**: Update email processor to show previews at /unsorted
3. **Phase 3**: Rename Category/Project to Account/Class
4. **Phase 4**: Enhanced vendor auto-creation from email data

This design maintains backward compatibility while adding the new pay-type functionality and email preview workflow you requested.