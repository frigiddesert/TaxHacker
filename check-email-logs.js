import { PrismaClient } from '@prisma/client'

async function checkEmailLogs() {
  const prisma = new PrismaClient()
  
  try {
    // Check EmailIngestionLog table
    const logs = await prisma.emailIngestionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    })
    
    console.log('=== Email Ingestion Logs ===')
    console.log(`Total logs found: ${logs.length}`)
    
    if (logs.length > 0) {
      logs.forEach((log, i) => {
        console.log(`\n${i + 1}. UID: ${log.uid}`)
        console.log(`   Mailbox: ${log.mailbox}`)
        console.log(`   UIDValidity: ${log.uidValidity}`)
        console.log(`   Status: ${log.status}`)
        console.log(`   Created: ${log.createdAt}`)
        if (log.error) {
          console.log(`   Error: ${log.error}`)
        }
      })
    } else {
      console.log('No email ingestion logs found.')
    }
    
    // Check Email table
    const emails = await prisma.email.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        createdAt: true
      }
    })
    
    console.log('\n=== Recent Emails ===')
    console.log(`Total emails found: ${emails.length}`)
    
    if (emails.length > 0) {
      emails.forEach((email, i) => {
        console.log(`\n${i + 1}. ID: ${email.id}`)
        console.log(`   From: ${email.from}`)
        console.log(`   Subject: ${email.subject}`)
        console.log(`   Received: ${email.receivedAt}`)
        console.log(`   Created: ${email.createdAt}`)
      })
    } else {
      console.log('No emails found in database.')
    }
    
  } catch (error) {
    console.error('Error checking email logs:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkEmailLogs()