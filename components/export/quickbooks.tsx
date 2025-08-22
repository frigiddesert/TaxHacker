"use client"

import { DateRangePicker } from "@/components/forms/date-range-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useDownload } from "@/hooks/use-download"
import { useProgress } from "@/hooks/use-progress"
import { useTransactionFilters } from "@/hooks/use-transaction-filters"
import { formatDate } from "date-fns"
import { useState } from "react"

export function ExportQuickBooksDialog({
  total,
  children,
}: {
  total: number
  children: React.ReactNode
}) {
  const [exportFilters, setExportFilters] = useTransactionFilters()
  const { isLoading, startProgress, progress } = useProgress({
    onError: (error) => {
      console.error("Export progress error:", error)
    },
  })

  const { download, isDownloading } = useDownload({
    onError: (error) => {
      console.error("Download error:", error)
    },
  })

  const handleSubmit = async () => {
    try {
      const progressId = await startProgress("quickbooks-export")

      const exportUrl = `/export/quickbooks?${new URLSearchParams({
        search: exportFilters?.search || "",
        dateFrom: exportFilters?.dateFrom || "",
        dateTo: exportFilters?.dateTo || "",
        ordering: exportFilters?.ordering || "",
        categoryCode: exportFilters?.categoryCode || "",
        projectCode: exportFilters?.projectCode || "",
        progressId: progressId || "",
      }).toString()}`

      await download(exportUrl, "quickbooks_journal_entries.csv")
    } catch (error) {
      console.error("Failed to start export:", error)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Export {total} Journal Entries to QuickBooks</DialogTitle>
          <DialogDescription>
            Export transactions as journal entries in QuickBooks Online compatible CSV format
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {exportFilters.search && (
              <div className="flex flex-row items-center gap-2">
                <span className="text-sm font-medium">Search query:</span>
                <span className="text-sm">{exportFilters.search}</span>
              </div>
            )}

            <div className="flex flex-row items-center gap-2">
              <span className="text-sm font-medium">Time range:</span>

              <DateRangePicker
                defaultDate={{
                  from: exportFilters?.dateFrom ? new Date(exportFilters.dateFrom) : undefined,
                  to: exportFilters?.dateTo ? new Date(exportFilters.dateTo) : undefined,
                }}
                defaultRange="all-time"
                onChange={(date) => {
                  setExportFilters({
                    ...exportFilters,
                    dateFrom: date?.from ? formatDate(date.from, "yyyy-MM-dd") : undefined,
                    dateTo: date?.to ? formatDate(date.to, "yyyy-MM-dd") : undefined,
                  })
                }}
              />
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Export will create journal entries with:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Debit to Expense Account</li>
              <li>Credit to Accounts Payable</li>
              <li>Vendor names and transaction details</li>
              <li>Proper double-entry accounting format</li>
              <li>QuickBooks Journal Entry import compatible</li>
            </ul>
            <p className="mt-2 text-xs italic">
              Note: You may need to map "Expense Account" to your specific expense accounts in QuickBooks
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-end">
          <Button type="button" onClick={handleSubmit} disabled={isLoading || isDownloading}>
            {isLoading
              ? "Exporting..."
              : isDownloading
                ? "Downloading..."
                : "Export Journal Entries"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}