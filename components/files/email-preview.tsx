"use client"

import { File } from "@/prisma/client"
import { Mail, Calendar, User } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"

interface EmailPreviewProps {
  file: File
}

export function EmailPreview({ file }: EmailPreviewProps) {
  const [emailContent, setEmailContent] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)

  const metadata = file.metadata as any

  useEffect(() => {
    async function fetchEmailContent() {
      try {
        const response = await fetch(`/files/raw/${file.id}`)
        const content = await response.text()
        setEmailContent(content)
      } catch (error) {
        console.error("Failed to fetch email content:", error)
        setEmailContent("Failed to load email content")
      } finally {
        setIsLoading(false)
      }
    }

    fetchEmailContent()
  }, [file.id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-h-96 overflow-hidden">
      {/* Email Header */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-5 w-5 text-blue-600" />
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            Email
          </Badge>
        </div>
        
        <div className="space-y-2 text-sm">
          {metadata?.from && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="font-medium">From:</span>
              <span>{metadata.from}</span>
            </div>
          )}
          
          {metadata?.subject && (
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-gray-500 mt-0.5" />
              <span className="font-medium">Subject:</span>
              <span className="font-semibold">{metadata.subject}</span>
            </div>
          )}
          
          {metadata?.receivedDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="font-medium">Received:</span>
              <span>{new Date(metadata.receivedDate).toLocaleString()}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Email Content */}
      <Card className="flex-1 overflow-hidden">
        <div className="p-4">
          <h3 className="font-medium mb-2 text-gray-700">Email Content:</h3>
          <div className="bg-gray-50 rounded p-3 max-h-64 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
              {emailContent}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  )
}