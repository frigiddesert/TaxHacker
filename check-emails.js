import { PrismaClient } from './prisma/client/index.js';

async function checkEmails() {
  const prisma = new PrismaClient();
  
  try {
    // Check email ingestion logs
    const logs = await prisma.emailIngestionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log('Recent email ingestion logs:', logs.length);
    if (logs.length > 0) {
      console.log('Latest log:', logs[0]);
    }
    
    // Check files from email source
    const emailFiles = await prisma.file.findMany({
      where: {
        metadata: {
          path: ['source'],
          equals: 'email'
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log('Email files in database:', emailFiles.length);
    if (emailFiles.length > 0) {
      console.log('Latest file:', emailFiles[0]);
    }
    
    // Check all files
    const allFiles = await prisma.file.count();
    console.log('Total files in database:', allFiles);
    
    // Check users
    const users = await prisma.user.count();
    console.log('Total users:', users);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmails();