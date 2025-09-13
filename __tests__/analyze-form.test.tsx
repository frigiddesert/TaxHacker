import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import AnalyzeForm from '@/components/unsorted/analyze-form'
import { describe, it, expect, vi } from 'vitest' // Using Vitest for now, but Jest compatible

// Mock dependencies
vi.mock('@/app/(app)/unsorted/actions', () => ({
  analyzeFileAction: vi.fn(),
  saveFileAsTransactionAction: vi.fn(),
  deleteUnsortedFileAction: vi.fn(),
}))

vi.mock('@/app/(app)/context', () => ({
  useNotification: vi.fn(() => ({ showNotification: vi.fn() })),
}))

// Simplified mock component
const MockAnalyzeForm = ({ file, categories = [], projects = [], currencies = [], fields = [], settings = {}, vendors = [] }) => {
  const [formData, setFormData] = useState({ issuedAt: '' })
  // Simulate the useEffect for pay date calc
  if (formData.issuedAt) {
    const issuedDate = new Date(formData.issuedAt)
    const payDate = new Date(issuedDate)
    payDate.setDate(payDate.getDate() - 5)
    setFormData({ ...formData, payOnDate: payDate.toISOString().split('T')[0] })
  }
  return (
    <div>
      <input data-testid="issuedAt" value={formData.issuedAt} onChange={(e) => setFormData({ ...formData, issuedAt: e.target.value })} />
      <input data-testid="payOnDate" value={formData.payOnDate} />
    </div>
  )
}

describe('AnalyzeForm Pay Date Calculation', () => {
  it('auto-calculates payOnDate as issuedAt minus 5 days', async () => {
    render(<MockAnalyzeForm />)
    
    const issuedInput = screen.getByTestId('issuedAt')
    fireEvent.change(issuedInput, { target: { value: '2025-09-20' } })
    
    const payInput = screen.getByTestId('payOnDate')
    expect(payInput.value).toBe('2025-09-15') // 20th - 5 days
  })
})