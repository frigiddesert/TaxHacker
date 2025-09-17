import { PrismaClient } from '@prisma/client'

async function checkEmailLogs() {
  const prisma = new PrismaClient()
  
  try {
    const logs = await prisma.emailIngestionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    
    console.log('=== Email Ingestion Logs ===')
    console.log(Total logs found: )
    
    if (logs.length > 0) {
      logs.forEach((log, i) => {
        console.log(\n. UID: )
        console.log(   Mailbox: )
        console.log(   UIDValidity: )
        console.log(   Status: )
        console.log(   Created: )
        if (log.error) {
          console.log(   Error: )
        }
      })
    } else {
      console.log('No email ingestion logs found.')
    }

    console.log('\nTip: Email bodies and attachments are stored as File records where metadata.source = "email".')
  } catch (error) {
    console.error('Error checking email logs:', error)
  } finally {
    await prisma.()
  }
}

checkEmailLogs()
