import { getCurrentUser } from "@/lib/auth"
import { updateProgress } from "@/models/progress"
import { getTransactions } from "@/models/transactions"
import { format } from "@fast-csv/format"
import { formatDate } from "date-fns"
import { NextResponse } from "next/server"
import { Readable } from "stream"

const TRANSACTIONS_CHUNK_SIZE = 300
const PROGRESS_UPDATE_INTERVAL_MS = 2000 // 2 seconds

export async function GET(request: Request) {
  const url = new URL(request.url)
  const filters = Object.fromEntries(url.searchParams.entries())
  const progressId = url.searchParams.get("progressId")

  const user = await getCurrentUser()
  const { transactions } = await getTransactions(user.id, filters)

  try {
    // Create a transform stream for CSV generation (Journal Entry format)
    const csvStream = format({
      headers: [
        "*JournalNo",
        "*JournalDate",
        "*AccountName",
        "Memo",
        "Debits",
        "Credits",
        "TaxCode",
        "Description",
        "Name",
        "Location",
        "Class"
      ],
      writeBOM: true,
      writeHeaders: true
    })

    let totalProcessed = 0
    let lastProgressUpdate = Date.now()
    let journalNo = 1

    // Update progress with total transactions if progressId is provided
    if (progressId) {
      await updateProgress(user.id, progressId, { total: transactions.length * 2 }) // Each transaction creates 2 journal entries
    }

    console.log(`Starting to process ${transactions.length} transactions for QuickBooks journal entries export`)

    // Process transactions in chunks to avoid memory issues
    for (let i = 0; i < transactions.length; i += TRANSACTIONS_CHUNK_SIZE) {
      const chunk = transactions.slice(i, i + TRANSACTIONS_CHUNK_SIZE)
      console.log(
        `Processing transactions ${i + 1}-${Math.min(i + TRANSACTIONS_CHUNK_SIZE, transactions.length)} of ${transactions.length}`
      )

      for (const transaction of chunk) {
        const amount = transaction.total ? (transaction.total / 100).toFixed(2) : "0.00"
        const vendorName = transaction.vendor?.name || transaction.merchant || "Unknown Vendor"
        const description = transaction.name || transaction.description || ""
        
        // First journal entry: Debit to Expense account
        const expenseEntry = {
          "*JournalNo": journalNo,
          "*JournalDate": transaction.issuedAt ? formatDate(transaction.issuedAt, "dd/MM/yyyy") : "",
          "*AccountName": "Expense Account", // User should map this to their actual expense account
          "Memo": transaction.note || `Imported from TaxHacker - ${transaction.id}`,
          "Debits": amount,
          "Credits": "",
          "TaxCode": "", // User can add tax codes as needed
          "Description": description,
          "Name": vendorName,
          "Location": "Main Office", // Default location
          "Class": "Office Expenses" // Default class
        }

        // Second journal entry: Credit to Accounts Payable
        const payableEntry = {
          "*JournalNo": journalNo,
          "*JournalDate": transaction.issuedAt ? formatDate(transaction.issuedAt, "dd/MM/yyyy") : "",
          "*AccountName": "Accounts Payable",
          "Memo": transaction.note || `Imported from TaxHacker - ${transaction.id}`,
          "Debits": "",
          "Credits": amount,
          "TaxCode": "",
          "Description": description,
          "Name": vendorName,
          "Location": "Main Office",
          "Class": "Office Expenses"
        }

        csvStream.write(expenseEntry)
        csvStream.write(payableEntry)
        totalProcessed += 2
        journalNo++

        // Update progress every PROGRESS_UPDATE_INTERVAL_MS milliseconds
        const now = Date.now()
        if (progressId && now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
          await updateProgress(user.id, progressId, { current: totalProcessed })
          lastProgressUpdate = now
        }
      }
    }

    csvStream.end()

    // Final progress update
    if (progressId) {
      await updateProgress(user.id, progressId, { current: totalProcessed })
    }

    console.log(`Finished processing all ${totalProcessed} journal entries for QuickBooks export`)

    const stream = Readable.from(csvStream)
    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="quickbooks_journal_entries_${formatDate(new Date(), "yyyy-MM-dd")}.csv"`,
      },
    })
  } catch (error) {
    console.error("Error exporting QuickBooks bills:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
