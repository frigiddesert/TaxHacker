import { getCurrentUser } from "@/lib/auth"
import { getTransactions } from "@/models/transactions"
import { getVendors } from "@/models/vendors"
import { manifest } from "./manifest"
import Link from "next/link"
import { formatDate } from "date-fns"

export default async function PayablesApp({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await getCurrentUser()
  const params = (await searchParams) || {}
  const dateFrom = params.dateFrom || ""
  const dateTo = params.dateTo || ""
  const { transactions } = await getTransactions(user.id, { dateFrom, dateTo })
  const vendors = await getVendors(user.id)
  const vendorMap = new Map(vendors.map((v) => [v.name, v]))

  const counts = { bill_pay: 0, ach: 0, autopay: 0, unknown: 0 }
  for (const t of transactions) {
    const v = t.merchant ? vendorMap.get(t.merchant) : undefined
    const m = v?.paymentMethod as string | undefined
    if (m === "bill_pay") counts.bill_pay++
    else if (m === "ach") counts.ach++
    else if (m === "autopay") counts.autopay++
    else counts.unknown++
  }

  const base = `/apps/payables/export?${new URLSearchParams({ dateFrom, dateTo }).toString()}`

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{manifest.icon} {manifest.name}</span>
        </h2>
      </header>

      <div className="flex flex-col gap-6 max-w-3xl">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Date range:</span>
          <form className="flex items-center gap-2" action="" method="get">
            <input type="date" name="dateFrom" defaultValue={dateFrom} className="border rounded px-2 py-1" />
            <span>—</span>
            <input type="date" name="dateTo" defaultValue={dateTo} className="border rounded px-2 py-1" />
            <button className="border rounded px-3 py-1">Apply</button>
          </form>
        </div>

        <div className="bg-muted p-4 rounded-md text-sm">
          <div className="font-medium mb-2">Summary</div>
          <ul className="list-disc list-inside grid grid-cols-2 gap-1">
            <li>Bill Pay: {counts.bill_pay}</li>
            <li>ACH: {counts.ach}</li>
            <li>Autopay: {counts.autopay}</li>
            <li>Unknown: {counts.unknown}</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <div className="font-medium">Exports</div>
          <div className="flex gap-2 flex-wrap">
            <Link href={base} className="border rounded px-3 py-2">Download All</Link>
            <Link href={`${base}&paymentMethod=bill_pay`} className="border rounded px-3 py-2">Bill Pay Only</Link>
            <Link href={`${base}&paymentMethod=ach`} className="border rounded px-3 py-2">ACH Only</Link>
            <Link href={`${base}&paymentMethod=autopay`} className="border rounded px-3 py-2">Autopay Only</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

