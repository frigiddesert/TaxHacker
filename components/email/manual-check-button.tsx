"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mail, Loader2, CheckCircle, XCircle } from "lucide-react"

export function ManualEmailCheckButton() {
  const [isChecking, setIsChecking] = useState(false)
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null)
  const [resultMessage, setResultMessage] = useState<string>("")
  const [resultDetails, setResultDetails] = useState<any>(null)

  const handleEmailCheck = async (force: boolean = false) => {
    setIsChecking(true)
    setLastResult(null)
    setResultMessage("")
    setResultDetails(null)

    try {
      const response = await fetch('/api/emails/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days: 7, force })
      })

      const data = await response.json()

      if (data.success) {
        setLastResult('success')
        setResultMessage(data.message || "Email check completed successfully")
        setResultDetails(data)
      } else {
        setLastResult('error')
        setResultMessage(data.error || "Email check failed")
        setResultDetails(data)
      }
    } catch (error) {
      setLastResult('error')
      setResultMessage("Failed to connect to email service")
      console.error('Email check error:', error)
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => handleEmailCheck(true)}
        disabled={isChecking}
        variant="outline"
        className="flex items-center gap-2"
      >
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        {isChecking ? "Processing Emails..." : "Force Process All Emails"}
      </Button>

      {lastResult && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {lastResult === 'success' ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <Badge variant="secondary" className="bg-green-50 text-green-700">
                  Success
                </Badge>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-600" />
                <Badge variant="secondary" className="bg-red-50 text-red-700">
                  Error
                </Badge>
              </>
            )}
            <span className="text-sm text-gray-600">{resultMessage}</span>
          </div>
          
          {resultDetails && lastResult === 'success' && (
            <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-2 rounded">
              <div>Total found: {resultDetails.totalFetched}</div>
              <div>Processed: {resultDetails.processed}</div>
              <div>Skipped: {resultDetails.skipped}</div>
              {resultDetails.failed > 0 && <div>Failed: {resultDetails.failed}</div>}
              {resultDetails.errors?.length > 0 && (
                <div className="text-red-600">
                  Errors: {resultDetails.errors.slice(0, 2).join(', ')}
                  {resultDetails.errors.length > 2 && ` (+${resultDetails.errors.length - 2} more)`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}