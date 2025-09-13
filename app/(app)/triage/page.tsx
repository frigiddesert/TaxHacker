"use client"

import { useEffect, useState } from "react"
import { useNotification } from "@/app/(app)/context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { Mail, FileText, Brain, Loader2, CheckSquare, Download } from "lucide-react"

type TriageEmail = {
  id: string
  from: string | null
  subject: string | null
  internalDate: Date | null
  status: string
  hasAttachment: boolean
  attachmentCount: number
  aiRecommendation?: {
    shouldProcess: boolean
    reason: string
    confidence: number
  }
}

export default function TriagePage() {
  const { showNotification } = useNotification()
  const [emails, setEmails] = useState<TriageEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [runningAI, setRunningAI] = useState(false)
  const [checkingEmails, setCheckingEmails] = useState(false)

  useEffect(() => {
    fetchTriageEmails()
  }, [])

  async function fetchTriageEmails() {
    try {
      setLoading(true)
      const response = await fetch('/api/triage/emails')
      if (!response.ok) throw new Error('Failed to fetch emails')
      const data = await response.json()
      setEmails(data.emails || [])
    } catch (error) {
      console.error('Error fetching triage emails:', error)
      showNotification({ 
        code: "global.banner", 
        message: "Failed to fetch emails", 
        type: "failed" 
      })
    } finally {
      setLoading(false)
    }
  }

  async function runAITriage() {
    try {
      setRunningAI(true)
      const response = await fetch('/api/triage/ai-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) throw new Error('Failed to run AI analysis')
      const data = await response.json()
      
      if (data.success) {
        await fetchTriageEmails() // Refresh to get AI recommendations
        showNotification({
          code: "global.banner",
          message: "AI analysis complete",
          type: "success"
        })
      }
    } catch (error) {
      console.error('Error running AI triage:', error)
      showNotification({
        code: "global.banner",
        message: "AI analysis failed",
        type: "failed"
      })
    } finally {
      setRunningAI(false)
    }
  }

  async function checkEmailsNow(force: boolean = true) {
    try {
      setCheckingEmails(true)
      const response = await fetch('/api/emails/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days: 7, force })
      })

      if (!response.ok) throw new Error('Failed to check emails')
      const data = await response.json()

      if (data.success) {
        showNotification({
          code: "global.banner",
          message: `Checked emails: ${data.processed || 0} processed, ${data.skipped || 0} skipped, ${data.failed || 0} failed`,
          type: "success"
        })
        await fetchTriageEmails() // Refresh the list
      } else {
        throw new Error(data.error || 'Failed to check emails')
      }
    } catch (error) {
      console.error('Error checking emails:', error)
      showNotification({
        code: "global.banner",
        message: "Failed to check emails",
        type: "failed"
      })
    } finally {
      setCheckingEmails(false)
    }
  }

  async function moveSelectedToUnsorted() {
    if (selectedEmails.size === 0) {
      showNotification({
        code: "global.banner",
        message: "Please select emails to process",
        type: "failed"
      })
      return
    }

    try {
      setProcessing(true)
      const response = await fetch('/api/triage/move-to-unsorted', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailIds: Array.from(selectedEmails)
        }),
      })

      if (!response.ok) throw new Error('Failed to move emails')
      const data = await response.json()
      
      if (data.success) {
        showNotification({
          code: "global.banner",
          message: `Moved ${selectedEmails.size} emails to unsorted`,
          type: "success"
        })
        showNotification({ code: "sidebar.transactions", message: "new" })
        
        // Clear selection and refresh
        setSelectedEmails(new Set())
        await fetchTriageEmails()
      }
    } catch (error) {
      console.error('Error moving emails:', error)
      showNotification({
        code: "global.banner",
        message: "Failed to move emails",
        type: "failed"
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleEmailSelect = (emailId: string, checked: boolean) => {
    const newSelected = new Set(selectedEmails)
    if (checked) {
      newSelected.add(emailId)
    } else {
      newSelected.delete(emailId)
    }
    setSelectedEmails(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmails(new Set(emails.map(email => email.id)))
    } else {
      setSelectedEmails(new Set())
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>
      case 'ai_filtered':
        return <Badge variant="secondary">AI Filtered</Badge>
      case 'processed':
        return <Badge variant="default">Processed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getAIRecommendationBadge = (recommendation?: TriageEmail['aiRecommendation']) => {
    if (!recommendation) return null
    
    if (recommendation.shouldProcess) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-200">
          Process ({Math.round(recommendation.confidence * 100)}%)
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-200">
          Skip ({Math.round(recommendation.confidence * 100)}%)
        </Badge>
      )
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading emails...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Email Triage</h1>
          <div className="flex gap-2">
            <Button
              onClick={() => checkEmailsNow(true)}
              disabled={checkingEmails}
              variant="outline"
            >
              {checkingEmails ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Force Process All Emails
                </>
              )}
            </Button>
            <Button
              onClick={runAITriage}
              disabled={runningAI || emails.length === 0}
              variant="outline"
            >
              {runningAI ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Run AI Filter
                </>
              )}
            </Button>
            <Button
              onClick={moveSelectedToUnsorted}
              disabled={processing || selectedEmails.size === 0}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Move Selected to Unsorted ({selectedEmails.size})
                </>
              )}
            </Button>
          </div>
        </div>
        <p className="text-gray-600">
          Review emails and select which ones should be processed for accounting
        </p>
      </div>

      {emails.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No emails to triage</h3>
          <p className="text-gray-600">All emails have been processed or there are no new emails.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedEmails.size === emails.length && emails.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Attachments</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => (
                <TableRow key={email.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedEmails.has(email.id)}
                      onCheckedChange={(checked) => handleEmailSelect(email.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {email.from || 'Unknown Sender'}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {email.subject || 'No Subject'}
                  </TableCell>
                  <TableCell>
                    {email.internalDate 
                      ? format(new Date(email.internalDate), 'MMM d, yyyy HH:mm')
                      : 'Unknown Date'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {email.hasAttachment && (
                        <FileText className="h-4 w-4 text-blue-500" />
                      )}
                      {email.attachmentCount > 0 && (
                        <span className="text-sm text-gray-600">
                          ({email.attachmentCount})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(email.status)}
                  </TableCell>
                  <TableCell>
                    {getAIRecommendationBadge(email.aiRecommendation)}
                    {email.aiRecommendation?.reason && (
                      <p className="text-xs text-gray-500 mt-1">
                        {email.aiRecommendation.reason}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}