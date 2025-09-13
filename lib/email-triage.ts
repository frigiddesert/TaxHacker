import { prisma } from '@/lib/db'
import { EmailIngestionLog, User } from '@/prisma/client'
import { getUserUploadsDirectory, unsortedFilePath, safePathJoin } from '@/lib/files'
import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

/**
 * Process an email from the triage system to unsorted files
 * This function finds existing files created by SimpleEmailFetch and makes them available in unsorted
 */
export async function processEmailToUnsorted(emailLog: EmailIngestionLog, user: User) {
  console.log(`Processing email ${emailLog.uid} to unsorted for user ${user.id}`)
  
  // First, find existing files created by SimpleEmailFetch for this email
  const existingFiles = await prisma.file.findMany({
    where: {
      userId: user.id,
      metadata: {
        path: ['seqno'],
        equals: emailLog.uid
      }
    }
  })

  console.log(`Found ${existingFiles.length} existing files for email ${emailLog.uid}`)

  if (existingFiles.length > 0) {
    // Update existing files to make them appear in unsorted
    const updatedFiles = []
    
    for (const file of existingFiles) {
      const updatedFile = await prisma.file.update({
        where: { id: file.id },
        data: {
          isReviewed: false, // Make sure they appear in unsorted
        }
      })
      updatedFiles.push(updatedFile)
      console.log(`Updated existing file: ${file.filename}`)
    }
    
    return updatedFiles[0] // Return the first file (email content)
  }

  // If no existing files found, create new ones using proper path structure
  const userUploadsDirectory = getUserUploadsDirectory(user)
  await fs.mkdir(userUploadsDirectory, { recursive: true })

  // Create email content file with proper path structure
  const emailFileUuid = randomUUID()
  const emailFileName = `email_${emailLog.uid}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
  const emailRelativePath = unsortedFilePath(emailFileUuid, emailFileName)
  const emailFullPath = safePathJoin(userUploadsDirectory, emailRelativePath)

  // Ensure directory exists
  await fs.mkdir(path.dirname(emailFullPath), { recursive: true })

  // Create email content
  const emailContent = `From: ${emailLog.from || 'unknown'}
To: Unknown
Subject: ${emailLog.subject || '(no subject)'}
Date: ${emailLog.internalDate?.toISOString() || new Date().toISOString()}
Message-ID: ${emailLog.messageId || 'unknown'}

--- Email Content ---

Email content processed from IMAP sequence number ${emailLog.uid}.
This email was moved from triage to unsorted for accounting review.

Original email details:
- Mailbox: ${emailLog.mailbox}
- UID Validity: ${emailLog.uidValidity}
- Internal Date: ${emailLog.internalDate?.toISOString()}
- Status: ${emailLog.status}
`

  await fs.writeFile(emailFullPath, emailContent, 'utf-8')

  // Create file record with RELATIVE path (critical fix!)
  const emailFileRecord = await prisma.file.create({
    data: {
      id: emailFileUuid,
      userId: user.id,
      filename: emailFileName,
      path: emailRelativePath, // Store RELATIVE path, not absolute!
      mimetype: 'text/plain',
      metadata: {
        source: 'email',
        seqno: emailLog.uid,
        uidValidity: emailLog.uidValidity.toString(),
        mailbox: emailLog.mailbox,
        from: emailLog.from,
        subject: emailLog.subject,
        receivedDate: emailLog.internalDate?.toISOString(),
        messageId: emailLog.messageId,
      },
      isReviewed: false,
      isSplitted: false,
    },
  })

  console.log(`Created email file: ${emailFileName} with path: ${emailRelativePath}`)

  // Handle PDF attachments if they exist
  const attachmentHashes = emailLog.attachmentHashes as string[] || []
  
  if (attachmentHashes.length > 0) {
    console.log(`Processing ${attachmentHashes.length} PDF attachments`)
    
    // Try to find existing PDF files created by SimpleEmailFetch
    const existingPdfFiles = await prisma.file.findMany({
      where: {
        userId: user.id,
        mimetype: 'application/pdf',
        metadata: {
          path: ['seqno'],
          equals: emailLog.uid
        }
      }
    })

    if (existingPdfFiles.length > 0) {
      // Update existing PDF files to appear in unsorted
      for (const pdfFile of existingPdfFiles) {
        await prisma.file.update({
          where: { id: pdfFile.id },
          data: {
            isReviewed: false,
          }
        })
        console.log(`Updated existing PDF file: ${pdfFile.filename}`)
      }
    } else {
      // Create placeholder PDF files if originals not found
      console.log(`No existing PDF files found, creating placeholders`)
      
      for (let i = 0; i < attachmentHashes.length; i++) {
        const attachmentHash = attachmentHashes[i]
        const pdfFileUuid = randomUUID()
        const pdfFileName = `attachment_${emailLog.uid}_${i + 1}_${attachmentHash.substring(0, 8)}.pdf`
        const pdfRelativePath = unsortedFilePath(pdfFileUuid, pdfFileName)
        const pdfFullPath = safePathJoin(userUploadsDirectory, pdfRelativePath)

        await fs.mkdir(path.dirname(pdfFullPath), { recursive: true })

        // Create placeholder PDF content
        const placeholderContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
50 750 Td
(PDF attachment placeholder) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000107 00000 n 
0000000181 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
275
%%EOF`

        await fs.writeFile(pdfFullPath, placeholderContent, 'utf-8')

        // Create PDF file record with RELATIVE path
        await prisma.file.create({
          data: {
            id: pdfFileUuid,
            userId: user.id,
            filename: pdfFileName,
            path: pdfRelativePath, // Store RELATIVE path!
            mimetype: 'application/pdf',
            metadata: {
              source: 'email',
              seqno: emailLog.uid,
              uidValidity: emailLog.uidValidity.toString(),
              mailbox: emailLog.mailbox,
              from: emailLog.from,
              subject: emailLog.subject,
              receivedDate: emailLog.internalDate?.toISOString(),
              messageId: emailLog.messageId,
              attachmentHash: attachmentHash,
              parentEmailFileId: emailFileRecord.id,
            },
            isReviewed: false,
            isSplitted: false,
          },
        })

        console.log(`Created PDF placeholder: ${pdfFileName} with path: ${pdfRelativePath}`)
      }
    }
  }

  return emailFileRecord
}

/**
 * Get AI recommendation for whether an email should be processed
 */
export async function getAIEmailRecommendation(emailLog: EmailIngestionLog, knownVendors: string[] = []) {
  // Simple rule-based filtering for now
  // In a full implementation, you would use an AI model here
  
  const subject = (emailLog.subject || '').toLowerCase()
  const from = (emailLog.from || '').toLowerCase()
  const attachmentHashes = emailLog.attachmentHashes as string[] || []

  let shouldProcess = false
  let reason = 'No clear indicators'
  let confidence = 0.5

  // Skip if it's a reply/forward
  if (subject.startsWith('re:') || subject.startsWith('fwd:') || subject.startsWith('fw:')) {
    shouldProcess = false
    reason = 'Reply or forwarded email'
    confidence = 0.9
  }
  // Process if it has attachments (likely invoices/bills)
  else if (attachmentHashes.length > 0) {
    shouldProcess = true
    reason = `Has ${attachmentHashes.length} attachment(s) - likely invoice/bill`
    confidence = 0.8
  }
  // Process if from known billing domains
  else if (from.includes('billing') || from.includes('invoice') || from.includes('accounting') || from.includes('noreply')) {
    shouldProcess = true
    reason = 'From billing/invoice domain'
    confidence = 0.7
  }
  // Process if subject contains billing keywords
  else if (subject.includes('invoice') || subject.includes('bill') || subject.includes('payment') || subject.includes('receipt')) {
    shouldProcess = true
    reason = 'Subject contains billing keywords'
    confidence = 0.7
  }
  // Skip newsletters, notifications, etc.
  else if (subject.includes('newsletter') || subject.includes('unsubscribe') || from.includes('newsletter')) {
    shouldProcess = false
    reason = 'Newsletter or promotional email'
    confidence = 0.8
  }
  // Check against known vendors
  else if (knownVendors.some(vendor => from.includes(vendor.toLowerCase()) || subject.includes(vendor.toLowerCase()))) {
    shouldProcess = true
    reason = 'From known vendor/biller'
    confidence = 0.9
  }

  return {
    shouldProcess,
    reason,
    confidence,
  }
}