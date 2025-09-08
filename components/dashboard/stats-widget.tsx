import { FiltersWidget } from "@/components/dashboard/filters-widget"
import { IncomeExpenseGraph } from "@/components/dashboard/income-expense-graph"
import { ProjectsWidget } from "@/components/dashboard/projects-widget"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { getProjects } from "@/models/projects"
import { getSettings } from "@/models/settings"
import { getDashboardStats, getDetailedTimeSeriesStats, getProjectStats } from "@/models/stats"
import { TransactionFilters } from "@/models/transactions"
import { ArrowDown, ArrowUp, BicepsFlexed } from "lucide-react"
import Link from "next/link"

export async function StatsWidget({ filters }: { filters: TransactionFilters }) {
  const user = await getCurrentUser()
  const projects = await getProjects(user.id)
  const settings = await getSettings(user.id)
  const defaultCurrency = settings.default_currency || "EUR"

  const stats = await getDashboardStats(user.id, filters)
  const statsTimeSeries = await getDetailedTimeSeriesStats(user.id, filters, defaultCurrency)
  const statsPerProject = Object.fromEntries(
    await Promise.all(
      projects.map((project) => getProjectStats(user.id, project.code, filters).then((stats) => [project.code, stats]))
    )
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Overview</h2>

        <FiltersWidget defaultFilters={filters} defaultRange="last-12-months" />
      </div>

      {statsTimeSeries.length > 0 && <IncomeExpenseGraph data={statsTimeSeries} defaultCurrency={defaultCurrency} />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/transactions?type=income">
          <Card className="bg-gradient-to-br from-white via-green-50/30 to-emerald-50/40 border-green-200/50 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <ArrowUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {Object.entries(stats.totalIncomePerCurrency).map(([currency, total]) => (
                <div
                  key={currency}
                  className="flex gap-2 items-center font-bold text-base first:text-2xl text-green-500"
                >
                  {formatCurrency(total, currency)}
                </div>
              ))}
              {!Object.entries(stats.totalIncomePerCurrency).length && <div className="text-2xl font-bold">0.00</div>}
            </CardContent>
          </Card>
        </Link>
        <Link href="/transactions?type=expense">
          <Card className="bg-gradient-to-br from-white via-red-50/30 to-rose-50/40 border-red-200/50 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <ArrowDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {Object.entries(stats.totalExpensesPerCurrency).map(([currency, total]) => (
                <div key={currency} className="flex gap-2 items-center font-bold text-base first:text-2xl text-red-500">
                  {formatCurrency(total, currency)}
                </div>
              ))}
              {!Object.entries(stats.totalExpensesPerCurrency).length && <div className="text-2xl font-bold">0.00</div>}
            </CardContent>
          </Card>
        </Link>
        <Link href="/transactions">
          <Card className="bg-gradient-to-br from-white via-pink-50/30 to-indigo-50/40 border-pink-200/50 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <BicepsFlexed className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              {Object.entries(stats.profitPerCurrency).map(([currency, total]) => (
                <div
                  key={currency}
                  className={`flex gap-2 items-center font-bold text-base first:text-2xl ${
                    total >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {formatCurrency(total, currency)}
                </div>
              ))}
              {!Object.entries(stats.profitPerCurrency).length && <div className="text-2xl font-bold">0.00</div>}
            </CardContent>
          </Card>
        </Link>
        <Link href="/transactions">
          <Card className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 border-blue-200/50 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processed Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.invoicesProcessed}</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Projects</h2>
      </div>

      <ProjectsWidget projects={projects} statsPerProject={statsPerProject} />
    </div>
  )
}
