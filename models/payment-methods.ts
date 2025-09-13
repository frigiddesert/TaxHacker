import { db } from "@/lib/db"

export async function getPaymentMethods(userId: string) {
  return await db.paymentMethod.findMany({
    where: { userId, isActive: true },
    orderBy: { sortOrder: 'asc' }
  })
}

export async function createPaymentMethod(userId: string, data: {
  code: string
  name: string
  description?: string
  sortOrder?: number
}) {
  return await db.paymentMethod.create({
    data: {
      userId,
      ...data,
      isActive: true
    }
  })
}

export async function updatePaymentMethod(id: string, userId: string, data: {
  name?: string
  description?: string
  isActive?: boolean
  sortOrder?: number
}) {
  return await db.paymentMethod.update({
    where: { id, userId },
    data
  })
}

export async function deletePaymentMethod(id: string, userId: string) {
  return await db.paymentMethod.delete({
    where: { id, userId }
  })
}