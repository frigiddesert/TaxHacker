"use client"

import { formatBytes } from "@/lib/utils"
import { File } from "@/prisma/client"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { EmailPreview } from "./email-preview"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, Calendar, User as UserIcon } from "lucide-react"

export function FilePreview({ file }: { file: File }) {
  const [isEnlarged, setIsEnlarged] = useState(false)

  const fileSize =
    file.metadata && typeof file.metadata === "object" && "size" in file.metadata ? Number(file.metadata.size) : 0
  
  // Check if this file originated from email
  const isFromEmail = file.metadata &&
    typeof file.metadata === "object" &&
    "source" in file.metadata &&
    file.metadata.source === "email"

  // Check if this is a plain-text email body saved as a file
  const isEmailFile = isFromEmail &&
    typeof file.metadata === "object" && 
    file.mimetype === "text/plain"

  if (isEmailFile) {
    return <EmailPreview file={file} />
  }

  // Check if this is a PDF file
  const isPdfFile = file.mimetype === "application/pdf"

  return (
    <>
      <div className="flex flex-col gap-2 p-4 overflow-hidden">
        {/* Show email header for any file that came from email (e.g., PDF attachments) */}
        {isFromEmail && (
          <Card className="p-3 bg-blue-50 border-blue-200 mb-2">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">Email</Badge>
            </div>
            <div className="space-y-1 text-xs sm:text-sm">
              {typeof file.metadata === 'object' && (file.metadata as any)?.from && (
                <div className="flex items-center gap-2">
                  <UserIcon className="h-3.5 w-3.5 text-gray-500" />
                  <span className="font-medium">From:</span>
                  <span>{(file.metadata as any).from}</span>
                </div>
              )}
              {typeof file.metadata === 'object' && (file.metadata as any)?.subject && (
                <div className="flex items-start gap-2">
                  <Mail className="h-3.5 w-3.5 text-gray-500 mt-0.5" />
                  <span className="font-medium">Subject:</span>
                  <span className="font-semibold">{(file.metadata as any).subject}</span>
                </div>
              )}
              {typeof file.metadata === 'object' && (file.metadata as any)?.receivedDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-gray-500" />
                  <span className="font-medium">Received:</span>
                  <span>{new Date((file.metadata as any).receivedDate).toLocaleString()}</span>
                </div>
              )}
            </div>
          </Card>
        )}
        <div className="aspect-[3/4]">
          {isPdfFile ? (
            // Embed PDF directly for better compatibility when conversion fails
            <div className="w-full h-full border rounded">
              <iframe
                src={`/files/preview/${file.id}`}
                width="100%"
                height="100%"
                className="border-0"
                title={file.filename}
              />
            </div>
          ) : (
            <>
              <Image
                src={`/files/preview/${file.id}`}
                alt={file.filename}
                width={300}
                height={400}
                loading="lazy"
                className={`${
                  isEnlarged
                    ? "fixed inset-0 z-50 m-auto w-screen h-screen object-contain cursor-zoom-out"
                    : "w-full h-full object-contain cursor-zoom-in"
                }`}
                onClick={() => setIsEnlarged(!isEnlarged)}
              />
              {isEnlarged && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setIsEnlarged(false)} />
              )}
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 mt-2 overflow-hidden">
          <h2 className="text-md underline font-semibold overflow-ellipsis">
            <Link href={`/files/download/${file.id}`}>{file.filename}</Link>
          </h2>
          <p className="text-sm overflow-ellipsis">
            <strong>Type:</strong> {file.mimetype}
          </p>
          {/* <p className="text-sm overflow-ellipsis">
            <strong>Uploaded:</strong> {format(file.createdAt, "MMM d, yyyy")}
          </p> */}
          <p className="text-sm">
            <strong>Size:</strong> {formatBytes(fileSize)}
          </p>
        </div>
      </div>
    </>
  )
}
