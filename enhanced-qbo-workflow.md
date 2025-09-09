# Enhanced QuickBooks Workflow Design

## ✅ QuickBooks Bill API Research Complete

### Current QBO Bill Structure (from /lib/qbo.ts):
```typescript
{
  vendorName: string           // Required: Vendor display name
  txnDate?: string            // Optional: Transaction date (YYYY-MM-DD)
  privateNote?: string        // Optional: Internal note
  lines: [{
    amount: number            // Required: Line item amount
    description?: string      // Optional: Line description  
    accountRefName: string    // Required: QB Account name/number
    accountRefValue?: string  // Optional: QB Account ID (for faster lookup)
    classRefName?: string     // Optional: QB Class name
  }]
}
```

### Required Data Mapping:
- ✅ **Vendor**: `Transaction.merchant` → QB Vendor (auto-created if missing)
- ✅ **Amount**: `Transaction.total / 100` → Bill line amount
- ✅ **Date**: `Transaction.issuedAt` → Bill transaction date
- ✅ **Account**: `Transaction.categoryCode` → QB Account reference
- ✅ **Class**: `Transaction.projectCode` → QB Class reference 
- ✅ **Description**: `Transaction.name || Transaction.description`
- ✅ **Note**: `Transaction.note` → QB private note

## Enhanced /unsorted Page Design

### 1. Add "Mark for QBO" Button
Location: In the `AnalyzeForm` component, next to "Save as Transaction"

```tsx
// New state for QBO marking
const [isMarkedForQBO, setIsMarkedForQBO] = useState(false)

// New button in the form actions
<div className="flex justify-between gap-4 pt-6">
  <Button type="button" onClick={() => deleteAction(file.id)} variant="destructive">
    <Trash2 /> Delete
  </Button>
  
  <div className="flex gap-2">
    <Button 
      type="button"
      variant="outline" 
      onClick={() => setIsMarkedForQBO(!isMarkedForQBO)}
      className={isMarkedForQBO ? "bg-blue-50 border-blue-300" : ""}
    >
      {isMarkedForQBO ? (
        <>
          <QuickBooksIcon className="h-4 w-4 text-blue-600" />
          Marked for QB
        </>
      ) : (
        <>
          <QuickBooksIcon className="h-4 w-4" />
          Mark for QB
        </>
      )}
    </Button>
    
    <Button type="submit" disabled={isSaving}>
      <ArrowDownToLine /> Save as Transaction
    </Button>
  </div>
</div>
```

### 2. Add QBO Icon Overlay
When marked, show QB icon overlay on PDF preview:

```tsx
// In FilePreview component
{isMarkedForQBO && (
  <div className="absolute top-2 right-2 bg-blue-600 text-white p-2 rounded-full shadow-lg">
    <QuickBooksIcon className="h-4 w-4" />
  </div>
)}
```

### 3. Batch QBO Processing
Add header button when files are marked:

```tsx
// In unsorted page header
{markedFiles.length > 0 && (
  <Button onClick={sendToQuickBooks}>
    <QuickBooksIcon />
    Send {markedFiles.length} to QuickBooks
  </Button>
)}
```

## PayType Custom Field Implementation

### 1. Backend Field Creation
Create migration to add payType field:

```typescript
// In a server action or migration
async function createPayTypeField(userId: string) {
  await prisma.field.upsert({
    where: { userId_code: { userId, code: "payType" } },
    update: {},
    create: {
      userId,
      code: "payType",
      name: "Payment Type",
      type: "select",
      options: { choices: ["ACH", "BillPay", "Auto"] },
      isExtra: true,
      isVisibleInAnalysis: true,
      isRequired: false,
    }
  })
}
```

### 2. Frontend Integration
The field will automatically appear in `AnalyzeForm` via the existing `extraFields` logic:

```tsx
// Already exists in analyze-form.tsx lines 292-303
{extraFields.map((field) => (
  <FormSelect // Will be FormSelect for select fields
    key={field.code}
    title={field.name}
    name={field.code}
    value={formData[field.code]}
    onValueChange={(value) => setFormData(prev => ({ ...prev, [field.code]: value }))}
    options={field.options?.choices || []}
  />
))}
```

## Payment Reports by PayType

### 1. Report Generation Logic
```typescript
async function generatePaymentReports(userId: string, dateRange: { from: Date, to: Date }) {
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      issuedAt: { gte: dateRange.from, lte: dateRange.to },
      extra: { path: ["payType"], not: null }
    },
    include: { vendor: true }
  })

  const grouped = {
    ACH: transactions.filter(t => t.extra?.payType === "ACH"),
    BillPay: transactions.filter(t => t.extra?.payType === "BillPay"), 
    Auto: transactions.filter(t => t.extra?.payType === "Auto")
  }

  return {
    ACH: generateACHReport(grouped.ACH),
    BillPay: generateBillPayReport(grouped.BillPay),
    Auto: generateAutoReport(grouped.Auto)
  }
}
```

### 2. ACH Report Format
```typescript
function generateACHReport(transactions: Transaction[]) {
  return transactions.map(t => ({
    vendor: t.merchant,
    amount: t.total / 100,
    accountNumber: t.vendor?.bankDetails || "Missing",
    routingNumber: "Extract from vendor.bankDetails",
    dueDate: t.issuedAt,
    reference: t.name,
    description: t.description
  }))
}
```

### 3. BillPay Report Format  
```typescript
function generateBillPayReport(transactions: Transaction[]) {
  return transactions.map(t => ({
    vendor: t.merchant,
    amount: t.total / 100,
    address: "Extract from vendor details",
    accountNumber: "Customer account with vendor",
    dueDate: t.issuedAt,
    reference: t.name
  }))
}
```

### 4. Auto Report Format
```typescript  
function generateAutoReport(transactions: Transaction[]) {
  return transactions.map(t => ({
    vendor: t.merchant,
    amount: t.total / 100,
    qbBillId: "Generated when sent to QB",
    cardLast4: "From payment processor",
    processedDate: t.issuedAt
  }))
}
```

## Implementation Priority

1. **Phase 1**: Create payType custom field backend
2. **Phase 2**: Add "Mark for QBO" button with icon overlay  
3. **Phase 3**: Implement batch QB sending from /unsorted
4. **Phase 4**: Create payment reports by payType

This creates a complete workflow: Email → Unsorted → Mark for QB → Batch Send → Payment Reports