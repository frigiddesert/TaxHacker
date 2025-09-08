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
import { useProgress } from "@/hooks/use-progress"
import { useTransactionFilters } from "@/hooks/use-transaction-filters"
import { formatDate } from "date-fns"
import { useState } from "react"

export function SendBillsToQBO({ total, children }: { total: number; children: React.ReactNode }) {
  const [filters, setFilters] = useTransactionFilters()
  const { isLoading, startProgress, progress } = useProgress({})
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    try {
      const progressId = await startProgress("qbo-send-bills")
      const params = new URLSearchParams({
        search: filters?.search || "",
        dateFrom: filters?.dateFrom || "",
        dateTo: filters?.dateTo || "",
        ordering: filters?.ordering || "",
        categoryCode: filters?.categoryCode || "",
        projectCode: filters?.projectCode || "",
        progressId: progressId || "",
      })
      const res = await fetch(`/qb/send-bills?${params.toString()}`, { method: "POST" })
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }
    } catch (e: any) {
      setError(e.message || String(e))
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Send {total} Bills to QuickBooks</DialogTitle>
          <DialogDescription>Creates Bills in your QuickBooks company for the filtered transactions</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-row items-center gap-2">
            <span className="text-sm font-medium">Time range:</span>
            <DateRangePicker
              defaultDate={{
                from: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
                to: filters?.dateTo ? new Date(filters.dateTo) : undefined,
              }}
              defaultRange="all-time"
              onChange={(date) => {
                setFilters({
                  ...filters,
                  dateFrom: date?.from ? formatDate(date.from, "yyyy-MM-dd") : undefined,
                  dateTo: date?.to ? formatDate(date.to, "yyyy-MM-dd") : undefined,
                })
              }}
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {isLoading && (
            <div className="text-sm text-muted-foreground">Processing… {progress?.current || 0}/{progress?.total || 0}</div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isLoading}>Send Bills</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

