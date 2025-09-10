import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getAIEmailRecommendation } from '@/lib/email-triage'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get known vendors to help with AI filtering
    const vendors = await prisma.vendor.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: {
        name: true,
      },
    })

    const knownVendorNames = vendors.map(v => v.name)

    // Get unprocessed emails (same logic as triage emails endpoint)
    const emailLogs = await prisma.emailIngestionLog.findMany({
      where: {
        userId: user.id,
        status: {
          in: ['pending', 'success'] // Don't re-analyze already AI filtered emails
        },
      },
    })

    // Check which emails already have corresponding File records
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

    files.forEach(file => {
      const metadata = file.metadata as any
      if (metadata?.emailUid && metadata?.emailUidValidity && metadata?.emailMailbox) {
        const emailKey = `${metadata.emailMailbox}-${metadata.emailUidValidity}-${metadata.emailUid}`
        processedEmails.add(emailKey)
      }
    })

    // Filter out already processed emails
    const unprocessedEmails = emailLogs.filter(email => {
      const emailKey = `${email.mailbox}-${email.uidValidity}-${email.uid}`
      return !processedEmails.has(emailKey)
    })

    let analyzedCount = 0
    const recommendations: Record<string, any> = {}

    // Analyze each email with AI recommendations
    for (const emailLog of unprocessedEmails) {
      try {
        const recommendation = await getAIEmailRecommendation(emailLog, knownVendorNames)
        recommendations[emailLog.id] = recommendation

        // Update the email log status to indicate AI analysis has been done
        await prisma.emailIngestionLog.update({
          where: { id: emailLog.id },
          data: { 
            status: 'ai_filtered',
            // Store AI recommendation in error field temporarily (we could add a dedicated column)
            error: JSON.stringify(recommendation)
          },
        })

        analyzedCount++
      } catch (error) {
        console.error(`Error analyzing email ${emailLog.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      analyzed: analyzedCount,
      recommendations,
    })
  } catch (error) {
    console.error('Error running AI analysis:', error)
    return NextResponse.json(
      { error: 'Failed to run AI analysis' },
      { status: 500 }
    )
  }
}