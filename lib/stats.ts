import { Field, Transaction } from "@/prisma/client"

export function calcTotalPerCurrency(transactions: Transaction[]): Record<string, number> {
  return transactions.reduce(
    (acc, transaction) => {
      if (transaction.convertedCurrencyCode) {
        acc[transaction.convertedCurrencyCode.toUpperCase()] =
          (acc[transaction.convertedCurrencyCode.toUpperCase()] || 0) + (transaction.convertedTotal || 0)
      } else if (transaction.currencyCode) {
        acc[transaction.currencyCode.toUpperCase()] =
          (acc[transaction.currencyCode.toUpperCase()] || 0) + (transaction.total || 0)
      }
      return acc
    },
    {} as Record<string, number>
  )
}

export const isTransactionIncomplete = (fields: Field[], transaction: Transaction): boolean => {
  const incompleteFields = incompleteTransactionFields(fields, transaction)

  return incompleteFields.length > 0
}

export const incompleteTransactionFields = (fields: Field[], transaction: Transaction): Field[] => {
  const requiredFields = fields.filter((field) => field.isRequired)

  return requiredFields.filter((field) => {
    const value = field.isExtra
      ? (transaction.extra as Record<string, any>)?.[field.code]
      : transaction[field.code as keyof Transaction]

    return value === undefined || value === null || value === ""
  })
}
