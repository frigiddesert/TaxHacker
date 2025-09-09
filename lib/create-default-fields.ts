import { prisma } from "@/lib/db"

export async function createPayTypeField(userId: string) {
  try {
    await prisma.field.upsert({
      where: { 
        userId_code: { userId, code: "payType" } 
      },
      update: {
        name: "Payment Type",
        type: "select",
        options: { 
          choices: ["ACH", "BillPay", "Auto", "Manual"] 
        },
        isExtra: true,
        isVisibleInAnalysis: true,
        isVisibleInList: true,
        isRequired: false,
        llm_prompt: "Determine the payment method type based on the vendor and invoice content. ACH for bank transfers, BillPay for online bill payments, Auto for automatic/recurring charges, Manual for other payment methods."
      },
      create: {
        userId,
        code: "payType",
        name: "Payment Type", 
        type: "select",
        options: { 
          choices: ["ACH", "BillPay", "Auto", "Manual"] 
        },
        isExtra: true,
        isVisibleInAnalysis: true,
        isVisibleInList: true,
        isRequired: false,
        llm_prompt: "Determine the payment method type based on the vendor and invoice content. ACH for bank transfers, BillPay for online bill payments, Auto for automatic/recurring charges, Manual for other payment methods."
      }
    })
    console.log(`Created payType field for user ${userId}`)
  } catch (error) {
    console.error(`Failed to create payType field for user ${userId}:`, error)
    throw error
  }
}

export async function ensureDefaultFieldsForUser(userId: string) {
  try {
    // Create payType field
    await createPayTypeField(userId)
    
    console.log(`Ensured default fields for user ${userId}`)
  } catch (error) {
    console.error(`Failed to ensure default fields for user ${userId}:`, error)
    throw error
  }
}

// Auto-create fields when user is created or logs in
export async function initializeUserFields(userId: string) {
  try {
    // Check if user already has fields initialized
    const existingFields = await prisma.field.count({
      where: { userId }
    })
    
    // If user has no custom fields, create the default ones
    if (existingFields === 0) {
      await ensureDefaultFieldsForUser(userId)
    } else {
      // Just ensure payType exists even if other fields exist
      await createPayTypeField(userId)
    }
  } catch (error) {
    console.error(`Failed to initialize fields for user ${userId}:`, error)
  }
}