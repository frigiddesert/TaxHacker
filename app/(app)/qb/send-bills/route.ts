import { getCurrentUser } from "@/lib/auth"
import { updateProgress } from "@/models/progress"
import { getTransactions } from "@/models/transactions"
import { createQboBill, findAccountByNumberOrName, findClassByName } from "@/lib/qbo"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { format as formatDateFn } from "date-fns"

const CHUNK = 100
const PROGRESS_UPDATE_INTERVAL_MS = 2000

export async function POST(request: Request) {
  const url = new URL(request.url)
  const filters = Object.fromEntries(url.searchParams.entries())
  const progressId = url.searchParams.get("progressId")

  const user = await getCurrentUser()
  const { transactions } = await getTransactions(user.id, filters)

  try {
    let totalProcessed = 0
    let lastProgressUpdate = Date.now()
    if (progressId) {
      await updateProgress(user.id, progressId, { total: transactions.length })
    }

    for (let i = 0; i < transactions.length; i += CHUNK) {
      const chunk = transactions.slice(i, i + CHUNK)
      for (const t of chunk) {
        const amount = t.total ? t.total / 100 : 0
        const vendorName = t.merchant || "Unknown Vendor"
        const txnDate = t.issuedAt ? formatDateFn(t.issuedAt, "yyyy-MM-dd") : undefined
        const description = t.name || t.description || undefined

        // Fallback to vendor defaults if missing
        let categoryCode = (t as any).categoryCode
        const categoryName = (t as any).category?.name || undefined
        let className = (t as any).project?.name || undefined
        if ((!categoryCode || !className) && t.merchant) {
          const vendor = await prisma.vendor.findFirst({ where: { userId: user.id, name: t.merchant } })
          if (vendor) {
            categoryCode = categoryCode || vendor.defaultCategoryCode || undefined
            className = className || vendor.defaultProjectCode || undefined
          }
        }

        // Resolve account by category (account number) or name
        let accountRefValue: string | undefined
        let accountRefName: string = categoryName || categoryCode || "Expense"
        try {
          const account = await findAccountByNumberOrName(user.id, categoryCode || undefined, categoryName || undefined)
          if (account) {
            accountRefValue = account.Id
            accountRefName = account.Name || account.FullyQualifiedName || accountRefName
          }
        } catch (e) {
          console.warn("[QB] Account lookup failed", e)
        }

        // Resolve class by project name
        let classRefName: string | undefined = className || undefined
        try {
          if (classRefName) {
            const cls = await findClassByName(user.id, classRefName)
            if (cls) {
              classRefName = cls.Name
            }
          }
        } catch (e) {
          console.warn("[QB] Class lookup failed", e)
        }

        await createQboBill(user.id, {
          vendorName,
          txnDate,
          privateNote: t.note || undefined,
          lines: [
            {
              amount,
              description,
              accountRefName,
              accountRefValue,
              classRefName,
            },
          ],
        })
        totalProcessed++
        const now = Date.now()
        if (progressId && now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
          await updateProgress(user.id, progressId, { current: totalProcessed })
          lastProgressUpdate = now
        }
      }
    }

    if (progressId) {
      await updateProgress(user.id, progressId, { current: totalProcessed })
    }

    return NextResponse.json({ ok: true, processed: totalProcessed })
  } catch (error) {
    console.error("[QB] Send bills failed", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
