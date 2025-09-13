const { PrismaClient } = require("@prisma/client");

async function checkEmails() {
  const prisma = new PrismaClient();
  
  try {
    const logs = await prisma.emailIngestionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    });
    
    console.log("Email Ingestion Logs:", logs.length);
    logs.forEach(log => {
      console.log(`UID: ${log.uid}, From: ${log.from}, Subject: ${log.subject}, Status: ${log.status}`);
    });
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmails();
