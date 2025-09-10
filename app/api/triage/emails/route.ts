import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get emails that are in EmailIngestionLog but haven't been processed to unsorted yet
    // We consider them "triaged" if they have a corresponding File record or if status is 'processed'
    const emailLogs = await prisma.emailIngestionLog.findMany({
      where: {
        userId: user.id,
        status: {
          in: ['pending', 'ai_filtered', 'success'] // Don't include failed emails
        },
      },
      orderBy: {
        internalDate: 'desc',
      },
    })

    // Check which emails already have corresponding File records (have been moved to unsorted)
    const processedEmails = new Set<string>()
    
    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        metadata: {
          path: ['source'],
          equals: 'email'
        }
      },
      select: {
        metadata: true
      }
    })

    // Extract email UIDs from file metadata to identify processed emails
    files.forEach(file => {
      const metadata = file.metadata as any
      if (metadata?.emailUid && metadata?.emailUidValidity && metadata?.emailMailbox) {
        const emailKey = `${metadata.emailMailbox}-${metadata.emailUidValidity}-${metadata.emailUid}`
        processedEmails.add(emailKey)
      }
    })

    // Filter out already processed emails and format for triage
    const triageEmails = emailLogs
      .filter(email => {
        const emailKey = `${email.mailbox}-${email.uidValidity}-${email.uid}`
        return !processedEmails.has(emailKey)
      })
      .map(email => {
        // Parse attachment hashes to count attachments
        const attachmentHashes = email.attachmentHashes as string[] || []
        
        // Parse AI recommendation from error field if it exists
        let aiRecommendation = null
        if (email.error && email.status === 'ai_filtered') {
          try {
            aiRecommendation = JSON.parse(email.error)
          } catch (e) {
            // Ignore parse errors
          }
        }

        return {
          id: email.id,
          from: email.from,
          subject: email.subject,
          internalDate: email.internalDate,
          status: email.status,
          hasAttachment: attachmentHashes.length > 0,
          attachmentCount: attachmentHashes.length,
          aiRecommendation,
        }
      })

    return NextResponse.json({
      success: true,
      emails: triageEmails,
    })
  } catch (error) {
    console.error('Error fetching triage emails:', error)
    return NextResponse.json(
      { error: 'Failed to fetch triage emails' },
      { status: 500 }
    )
  }
}