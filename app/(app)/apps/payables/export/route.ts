import { getCurrentUser } from "@/lib/auth"
import { getTransactions } from "@/models/transactions"
import { getVendors } from "@/models/vendors"
import { format } from "@fast-csv/format"
import { NextResponse } from "next/server"
import { Readable } from "stream"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const user = await getCurrentUser()
  const dateFrom = url.searchParams.get("dateFrom") || undefined
  const dateTo = url.searchParams.get("dateTo") || undefined
  const method = url.searchParams.get("paymentMethod") || undefined
  const { transactions } = await getTransactions(user.id, { dateFrom, dateTo })
  const vendors = await getVendors(user.id)
  const vendorMap = new Map(vendors.map((v) => [v.name, v]))

  const csv = format({ headers: true, writeBOM: true })
  csv.write({
    Vendor: "Vendor",
    PaymentMethod: "PaymentMethod",
    Date: "Date",
    Amount: "Amount",
    Account: "Account",
    Class: "Class",
    Memo: "Memo",
    TxId: "TxId",
  })

  for (const t of transactions) {
    const v = t.merchant ? vendorMap.get(t.merchant) : undefined
    const pm = v?.paymentMethod || "unknown"
    if (method && pm !== method) continue
    const amount = t.total ? (t.total / 100).toFixed(2) : "0.00"
    csv.write({
      Vendor: t.merchant || "",
      PaymentMethod: pm,
      Date: t.issuedAt ? t.issuedAt.toISOString().slice(0, 10) : "",
      Amount: amount,
      Account: (t as any).category?.name || (t as any).categoryCode || "",
      Class: (t as any).project?.name || "",
      Memo: t.name || t.description || "",
      TxId: t.id,
    })
  }

  csv.end()
  const stream = Readable.from(csv)
  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payables_${dateFrom || "all"}_${dateTo || "all"}.csv"`,
    },
  })
}
