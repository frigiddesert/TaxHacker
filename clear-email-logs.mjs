import { PrismaClient } from '@prisma/client'

async function clearEmailLogs() {
  const prisma = new PrismaClient()
  
  try {
    console.log('Clearing email ingestion logs...')
    
    // Count existing logs
    const existingCount = await prisma.emailIngestionLog.count()
    console.log(`Found ${existingCount} existing email ingestion logs`)
    
    // Delete all email ingestion logs
    const deleted = await prisma.emailIngestionLog.deleteMany({})
    console.log(`Deleted ${deleted.count} email ingestion logs`)
    
    // Also count emails in the Email table
    const emailCount = await prisma.email.count()
    console.log(`Found ${emailCount} emails in the Email table`)
    
    console.log('Email logs cleared successfully!')
    
  } catch (error) {
    console.error('Error clearing email logs:', error)
  } finally {
    await prisma.$disconnect()
  }
}

clearEmailLogs()