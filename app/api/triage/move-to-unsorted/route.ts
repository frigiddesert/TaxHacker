import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { processEmailToUnsorted } from '@/lib/email-triage'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emailIds } = await request.json()
    
    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json(
        { error: 'Email IDs are required' },
        { status: 400 }
      )
    }

    // Get the email logs for the selected emails
    const emailLogs = await prisma.emailIngestionLog.findMany({
      where: {
        id: { in: emailIds },
        userId: user.id,
      },
    })

    if (emailLogs.length === 0) {
      return NextResponse.json(
        { error: 'No valid emails found' },
        { status: 404 }
      )
    }

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Process each email to move it to unsorted
    for (const emailLog of emailLogs) {
      try {
        await processEmailToUnsorted(emailLog, user)
        results.processed++
        
        // Update the email log status
        await prisma.emailIngestionLog.update({
          where: { id: emailLog.id },
          data: { status: 'processed' },
        })
      } catch (error) {
        console.error(`Error processing email ${emailLog.id}:`, error)
        results.failed++
        results.errors.push(`Failed to process email from ${emailLog.from}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: results.processed > 0,
      processed: results.processed,
      failed: results.failed,
      errors: results.errors,
    })
  } catch (error) {
    console.error('Error moving emails to unsorted:', error)
    return NextResponse.json(
      { error: 'Failed to move emails to unsorted' },
      { status: 500 }
    )
  }
}