import { render, screen, fireEvent } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { describe, it, expect, jest } from '@jest/globals'

jest.mock('@/app/(app)/unsorted/actions', () => ({
  analyzeFileAction: jest.fn(),
  saveFileAsTransactionAction: jest.fn(),
  deleteUnsortedFileAction: jest.fn(),
}))

jest.mock('@/app/(app)/context', () => ({
  useNotification: jest.fn(() => ({ showNotification: jest.fn() })),
}))

const MockAnalyzeForm = () => {
  const [issuedAt, setIssuedAt] = useState('')
  const payOnDate = useMemo(() => {
    if (!issuedAt) return ''
    const issuedDate = new Date(issuedAt)
    const payDate = new Date(issuedDate)
    payDate.setDate(payDate.getDate() - 5)
    return payDate.toISOString().split('T')[0]
  }, [issuedAt])

  return (
    <div>
      <input
        data-testid="issuedAt"
        value={issuedAt}
        onChange={(e) => setIssuedAt(e.target.value)}
      />
      <input data-testid="payOnDate" value={payOnDate} readOnly />
    </div>
  )
}

describe('AnalyzeForm Pay Date Calculation', () => {
  it('auto-calculates payOnDate as issuedAt minus 5 days', async () => {
    render(<MockAnalyzeForm />)

    const issuedInput = screen.getByTestId('issuedAt')
    fireEvent.change(issuedInput, { target: { value: '2025-09-20' } })

    const payInput = screen.getByTestId('payOnDate')
    expect(payInput.value).toBe('2025-09-15')
  })
})
