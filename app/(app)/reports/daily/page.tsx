"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"

type DailyReportTransaction = {
  id: string
  merchant: string | null
  total: number | null
  description: string | null
  categoryCode: string | null
  projectCode: string | null
  payOnDate: Date | null
  createdAt: Date
  vendor?: {
    paymentMethod: string
  }
}

export default function DailyReportPage() {
  const [transactions, setTransactions] = useState<DailyReportTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    fetchDailyTransactions(selectedDate)
  }, [selectedDate])

  async function fetchDailyTransactions(date: string) {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports/daily?date=${date}`)
      if (!response.ok) throw new Error('Failed to fetch transactions')
      const data = await response.json()
      setTransactions(data.transactions || [])
    } catch (error) {
      console.error('Error fetching daily transactions:', error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  // Group transactions by payment method
  const groupedTransactions = transactions.reduce((acc, transaction) => {
    const paymentMethod = transaction.vendor?.paymentMethod || 'Manual'
    if (!acc[paymentMethod]) {
      acc[paymentMethod] = []
    }
    acc[paymentMethod].push(transaction)
    return acc
  }, {} as Record<string, DailyReportTransaction[]>)

  const formatAmount = (amount: number | null) => {
    if (!amount) return '$0.00'
    return `$${(amount / 100).toFixed(2)}`
  }

  const PaymentSection = ({ title, transactions }: { title: string, transactions: DailyReportTransaction[] }) => (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4 border-b-2 border-gray-300 pb-2">{title}</h2>
      {transactions.length === 0 ? (
        <p className="text-gray-500 italic">No invoices for {title}</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between py-2 border-b border-gray-200">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900 truncate">
                  {transaction.merchant || 'Unknown Merchant'}
                </span>
              </div>
              <div className="flex-1 text-center">
                <span className="font-semibold text-green-600">
                  {formatAmount(transaction.total)}
                </span>
              </div>
              <div className="flex-1 text-center text-sm text-gray-600 truncate">
                {transaction.categoryCode || 'No Account'}
              </div>
              <div className="flex-1 text-center text-sm text-gray-600 truncate">
                {transaction.projectCode || 'No Class'}
              </div>
              <div className="flex-1 text-right text-sm text-gray-600 truncate">
                {transaction.description || 'No description'}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t-2 border-gray-400">
            <div className="flex justify-between">
              <span className="font-bold">Total {title}:</span>
              <span className="font-bold text-green-600">
                {formatAmount(transactions.reduce((sum, t) => sum + (t.total || 0), 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Daily Payment Report</h1>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-gray-600">
          Invoices processed on {format(new Date(selectedDate), 'MMMM d, yyyy')}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading transactions...</p>
        </div>
      ) : (
        <div>
          {/* Header Row */}
          <div className="mb-6 bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-gray-700 uppercase tracking-wide">
              <div className="flex-1">Biller (Merchant)</div>
              <div className="flex-1 text-center">Amount</div>
              <div className="flex-1 text-center">QB Account</div>
              <div className="flex-1 text-center">QB Class</div>
              <div className="flex-1 text-right">Short Description</div>
            </div>
          </div>

          <PaymentSection title="ACH Pay" transactions={groupedTransactions['ACH'] || []} />
          <PaymentSection title="BillPay" transactions={groupedTransactions['BillPay'] || []} />
          <PaymentSection title="AutoPay" transactions={groupedTransactions['Auto'] || []} />
          <PaymentSection title="Manual" transactions={groupedTransactions['Manual'] || []} />

          {/* Grand Total */}
          <div className="mt-8 pt-4 border-t-4 border-gray-800">
            <div className="flex justify-between text-xl font-bold">
              <span>Grand Total:</span>
              <span className="text-green-600">
                {formatAmount(transactions.reduce((sum, t) => sum + (t.total || 0), 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}