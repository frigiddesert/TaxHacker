"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mail, Loader2, CheckCircle, XCircle } from "lucide-react"

export function ManualEmailCheckButton() {
  const [isChecking, setIsChecking] = useState(false)
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null)
  const [resultMessage, setResultMessage] = useState<string>("")

  const handleEmailCheck = async () => {
    setIsChecking(true)
    setLastResult(null)
    setResultMessage("")

    try {
      const response = await fetch('/api/email/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data.success) {
        setLastResult('success')
        setResultMessage(data.message || "Email check completed successfully")
      } else {
        setLastResult('error')
        setResultMessage(data.error || "Email check failed")
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
        onClick={handleEmailCheck}
        disabled={isChecking}
        variant="outline"
        className="flex items-center gap-2"
      >
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        {isChecking ? "Checking Emails..." : "Check Emails Now"}
      </Button>

      {lastResult && (
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
      )}
    </div>
  )
}