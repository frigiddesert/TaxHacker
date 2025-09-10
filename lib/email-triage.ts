import { prisma } from '@/lib/db'
import { EmailIngestionLog, User } from '@/prisma/client'
import { getUserUploadsDirectory } from '@/lib/upload'
import path from 'path'
import fs from 'fs/promises'

/**
 * Process an email from the triage system to unsorted files
 */
export async function processEmailToUnsorted(emailLog: EmailIngestionLog, user: User) {
  const uploadsDir = getUserUploadsDirectory(user.email)
  const unsortedDir = path.join(uploadsDir, 'unsorted')
  
  // Ensure unsorted directory exists
  await fs.mkdir(unsortedDir, { recursive: true })

  // Create metadata for the email file
  const emailMetadata = {
    source: 'email',
    emailUid: emailLog.uid,
    emailUidValidity: emailLog.uidValidity.toString(),
    emailMailbox: emailLog.mailbox,
    from: emailLog.from,
    subject: emailLog.subject,
    receivedDate: emailLog.internalDate?.toISOString(),
    messageId: emailLog.messageId,
  }

  // Create a text file with email content (we'll need to fetch the actual email content)
  const emailFileName = `${emailLog.messageId || `email-${emailLog.uid}`}.txt`
  const emailFilePath = path.join(unsortedDir, emailFileName)
  
  // Create email content text file
  const emailContent = `From: ${emailLog.from}
Subject: ${emailLog.subject}
Date: ${emailLog.internalDate?.toISOString()}
Message-ID: ${emailLog.messageId}

[Email content will be populated when processing attachments]`

  await fs.writeFile(emailFilePath, emailContent, 'utf-8')

  // Create File record for the email
  const emailFileRecord = await prisma.file.create({
    data: {
      userId: user.id,
      filename: emailFileName,
      path: emailFilePath,
      mimetype: 'text/plain',
      metadata: emailMetadata,
      isReviewed: false,
      isSplitted: false,
    },
  })

  // If there are attachments, we need to process them as well
  const attachmentHashes = emailLog.attachmentHashes as string[] || []
  
  if (attachmentHashes.length > 0) {
    // For now, we'll create placeholder files for attachments
    // In a full implementation, you would need to fetch the actual attachment content
    // from the email server and save it to disk
    
    for (let i = 0; i < attachmentHashes.length; i++) {
      const attachmentHash = attachmentHashes[i]
      const attachmentFileName = `attachment-${i + 1}-${attachmentHash.substring(0, 8)}.pdf` // Assume PDF for now
      const attachmentFilePath = path.join(unsortedDir, attachmentFileName)
      
      // Create attachment metadata
      const attachmentMetadata = {
        source: 'email',
        emailUid: emailLog.uid,
        emailUidValidity: emailLog.uidValidity.toString(),
        emailMailbox: emailLog.mailbox,
        from: emailLog.from,
        subject: emailLog.subject,
        receivedDate: emailLog.internalDate?.toISOString(),
        messageId: emailLog.messageId,
        attachmentHash: attachmentHash,
        parentEmailFileId: emailFileRecord.id,
      }

      // Note: In a full implementation, you would fetch the actual attachment content here
      // For now, we'll just create a placeholder file
      await fs.writeFile(attachmentFilePath, 'PDF attachment placeholder', 'utf-8')

      // Create File record for the attachment
      await prisma.file.create({
        data: {
          userId: user.id,
          filename: attachmentFileName,
          path: attachmentFilePath,
          mimetype: 'application/pdf', // Assume PDF for now
          metadata: attachmentMetadata,
          isReviewed: false,
          isSplitted: false,
        },
      })
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