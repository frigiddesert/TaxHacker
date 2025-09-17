import { FormError } from "@/components/forms/error"
import { formatCurrency } from "@/lib/utils"
import { format, startOfDay } from "date-fns"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../ui/button"

async function getCurrencyRate(currencyCodeFrom: string, currencyCodeTo: string, date: Date): Promise<number> {
  const formattedDate = format(date, "yyyy-MM-dd")
  const response = await fetch(`/api/currency?from=${currencyCodeFrom}&to=${currencyCodeTo}&date=${formattedDate}`)

  if (!response.ok) {
    const errorData = await response.json()
    console.log("Currency API error:", errorData.error)
    throw new Error(errorData.error || "Failed to fetch currency rate")
  }

  const data = await response.json()
  return data.rate
}

export const CurrencyConverterTool = ({
  originalTotal,
  originalCurrencyCode,
  targetCurrencyCode,
  date,
  onChange,
}: {
  originalTotal: number
  originalCurrencyCode: string
  targetCurrencyCode: string
  date?: Date | undefined
  onChange?: (value: number) => void
}) => {
  const normalizedDate = startOfDay(date || new Date(Date.now() - 24 * 60 * 60 * 1000))
  const normalizedDateString = format(normalizedDate, "yyyy-MM-dd")
  const [exchangeRate, setExchangeRate] = useState(0)
  const [convertedTotal, setConvertedTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAndUpdateRates = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const rate = await getCurrencyRate(originalCurrencyCode, targetCurrencyCode, normalizedDate)
      setExchangeRate(rate)
      setConvertedTotal(Math.round(originalTotal * rate * 100) / 100)
    } catch (error) {
      console.error("Error fetching currency rates:", error)
      setExchangeRate(0)
      setConvertedTotal(0)
      setError(error instanceof Error ? error.message : "Failed to fetch currency rate")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRestart = () => {
    setError(null)
    fetchAndUpdateRates()
  }

  useEffect(() => {
    fetchAndUpdateRates()
  }, [originalCurrencyCode, targetCurrencyCode, normalizedDateString, originalTotal])

  useEffect(() => {
    onChange?.(convertedTotal)
  }, [convertedTotal])

  if (!originalTotal || !originalCurrencyCode || !targetCurrencyCode || originalCurrencyCode === targetCurrencyCode) {
    return <></>
  }

  return (
    <div className="flex flex-row gap-2 items-center">
      {isLoading ? (
        <div className="flex flex-row items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <div className="font-semibold">Loading exchange rates...</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div>{formatCurrency(originalTotal * 100, originalCurrencyCode)}</div>
            <div>=</div>
            <div>{formatCurrency(originalTotal * 100 * exchangeRate, targetCurrencyCode).slice(0, 1)}</div>
            <input
              type="number"
              step="0.01"
              name="convertedTotal"
              value={convertedTotal}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value || "0")
                if (!Number.isNaN(newValue)) {
                  setConvertedTotal(Math.round(newValue * 100) / 100)
                }
              }}
              className="w-32 rounded-md border border-input px-2 py-1"
            />
          </div>
          {!error && (
            <div className="text-xs text-muted-foreground">The exchange rate will be added to the transaction</div>
          )}
          {error && (
            <div className="flex flex-row gap-2">
              <FormError className="mt-0 text-sm">{error}</FormError>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleRestart}>
                Retry
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
