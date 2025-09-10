import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Run the email processor script
    return new Promise<NextResponse>((resolve) => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'email-processor.ts')
      const child = spawn('npx', ['ts-node', scriptPath], {
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
      })

      let output = ''
      let errorOutput = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          // Parse the output to get statistics
          const lines = output.split('\n')
          const processedMatch = output.match(/Processed (\d+) emails/)
          const failedMatch = output.match(/Failed (\d+) emails/)
          
          const processed = processedMatch ? parseInt(processedMatch[1]) : 0
          const failed = failedMatch ? parseInt(failedMatch[1]) : 0

          resolve(NextResponse.json({
            success: true,
            processed,
            failed,
            output: output.trim(),
          }))
        } else {
          console.error('Email processor failed:', errorOutput)
          resolve(NextResponse.json({
            success: false,
            error: 'Email processing failed',
            details: errorOutput.trim(),
          }, { status: 500 }))
        }
      })

      child.on('error', (error) => {
        console.error('Failed to spawn email processor:', error)
        resolve(NextResponse.json({
          success: false,
          error: 'Failed to start email processor',
          details: error.message,
        }, { status: 500 }))
      })
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