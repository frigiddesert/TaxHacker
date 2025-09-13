const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    // Count QB accounts
    const qbAccountCount = await prisma.qbAccount.count()
    console.log(`Total QB Accounts: ${qbAccountCount}`)
    
    // Get first 5 QB accounts
    const qbAccounts = await prisma.qbAccount.findMany({
      take: 5,
      select: {
        id: true,
        accountNumber: true,
        fullName: true,
        type: true,
        userId: true
      }
    })
    
    console.log('Sample QB Accounts:')
    qbAccounts.forEach(account => {
      console.log(`- ${account.accountNumber || 'N/A'}: ${account.fullName} (${account.type}) [User: ${account.userId}]`)
    })
    
    // Get user count
    const userCount = await prisma.user.count()
    console.log(`Total Users: ${userCount}`)
    
    // Get first user
    const firstUser = await prisma.user.findFirst({
      select: {
        id: true,
        email: true
      }
    })
    
    if (firstUser) {
      console.log(`First user: ${firstUser.email} (${firstUser.id})`)
      
      // Get QB accounts for first user
      const userQbAccounts = await prisma.qbAccount.findMany({
        where: { userId: firstUser.id },
        select: {
          id: true,
          accountNumber: true,
          fullName: true,
          type: true
        }
      })
      
      console.log(`QB Accounts for user ${firstUser.email}: ${userQbAccounts.length}`)
      userQbAccounts.forEach(account => {
        console.log(`- ${account.accountNumber || 'N/A'}: ${account.fullName} (${account.type})`)
      })
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()