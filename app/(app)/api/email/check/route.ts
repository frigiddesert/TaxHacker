import { getCurrentUser } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const user = await getCurrentUser()
    console.log(`Manual email check initiated by user ${user.id}`)

    // Dynamically import the email service to avoid build-time issues
    const { default: EmailIngestionService } = await import("@/scripts/email-processor")
    const emailService = new EmailIngestionService()
    
    try {
      await emailService.checkOnce()
      console.log('Email check completed successfully')
      
      return NextResponse.json({ 
        success: true, 
        message: "Email check completed successfully" 
      })
    } catch (error) {
      console.error('Email check failed:', error)
      
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : "Email check failed" 
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Failed to initiate email check:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to initiate email check" 
      },
      { status: 500 }
    )
  }
}