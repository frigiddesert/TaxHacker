import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { SimpleEmailFetch } from '@/lib/simple-email-fetch'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Email check request received for user:', user.email)

    // Parse request body for force parameter
    const body = await request.json().catch(() => ({}))
    const force = body.force === true

    console.log(`Fetching emails... (force: ${force})`)

    // Use the simple email fetch service
    const emailService = new SimpleEmailFetch()
    const result = await emailService.fetchEmails(force)

    console.log('Email fetch completed:', {
      totalFetched: result.totalFetched,
      processed: result.processed,
      failed: result.failed,
      errors: result.errors.length
    })

    return NextResponse.json({
      success: true,
      totalFetched: result.totalFetched,
      processed: result.processed,
      failed: result.failed,
      skipped: 0,
      errors: result.errors,
      message: `Found ${result.totalFetched} emails. Processed: ${result.processed}, Failed: ${result.failed}`,
    })
  } catch (error) {
    console.error('Error in email check API:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to check emails',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}