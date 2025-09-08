import { TransactionFilters } from "@/models/transactions"
import { format } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

const filterKeys = ["search", "dateFrom", "dateTo", "ordering", "categoryCode", "projectCode"]

export function useTransactionFilters(defaultFilters?: TransactionFilters) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<TransactionFilters>({
    ...defaultFilters,
    ...searchParamsToFilters(searchParams),
  })

  useEffect(() => {
    const newSearchParams = filtersToSearchParams(filters, searchParams)
    router.push(`?${newSearchParams.toString()}`)
  }, [filters])

  useEffect(() => {
    setFilters(searchParamsToFilters(searchParams))
  }, [searchParams])

  return [filters, setFilters] as const
}

export function searchParamsToFilters(searchParams: URLSearchParams) {
  return filterKeys.reduce((acc, filter) => {
    acc[filter] = searchParams.get(filter) || ""
    return acc
  }, {} as Record<string, string>) as TransactionFilters
}

export function filtersToSearchParams(
  filters: TransactionFilters,
  currentSearchParams?: URLSearchParams
): URLSearchParams {
  // Copy of all non-filter parameters back to the URL
  const searchParams = new URLSearchParams()
  if (currentSearchParams) {
    currentSearchParams.forEach((value, key) => {
      if (!filterKeys.includes(key)) {
        searchParams.set(key, value)
      }
    })
  }

  if (filters.search) {
    searchParams.set("search", filters.search)
  } else {
    searchParams.delete("search")
  }

  if (filters.dateFrom) {
    searchParams.set("dateFrom", format(new Date(filters.dateFrom), "yyyy-MM-dd"))
  } else {
    searchParams.delete("dateFrom")
  }

  if (filters.dateTo) {
    searchParams.set("dateTo", format(new Date(filters.dateTo), "yyyy-MM-dd"))
  } else {
    searchParams.delete("dateTo")
  }

  if (filters.ordering) {
    searchParams.set("ordering", filters.ordering)
  } else {
    searchParams.delete("ordering")
  }

  if (filters.categoryCode && filters.categoryCode !== "-") {
    searchParams.set("categoryCode", filters.categoryCode)
  } else {
    searchParams.delete("categoryCode")
  }

  if (filters.projectCode && filters.projectCode !== "-") {
    searchParams.set("projectCode", filters.projectCode)
  } else {
    searchParams.delete("projectCode")
  }

  return searchParams
}

export function isFiltered(filters: TransactionFilters) {
  return Object.values(filters).some((value) => value !== "" && value !== "-")
}
