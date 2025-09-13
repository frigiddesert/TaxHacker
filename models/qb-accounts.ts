import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

export type QbAccountData = {
  [key: string]: unknown
}

export const getQbAccounts = cache(async (userId: string) => {
  return await prisma.qbAccount.findMany({
    where: { userId },
    orderBy: [
      { type: "asc" },
      { fullName: "asc" },
    ],
  })
})

export const getQbAccountById = cache(async (id: string) => {
  return await prisma.qbAccount.findUnique({
    where: { id },
  })
})

export const createQbAccount = async (userId: string, companyId: string, qbAccount: QbAccountData) => {
  return await prisma.qbAccount.create({
    data: {
      ...qbAccount,
      user: {
        connect: {
          id: userId,
        },
      },
      company: {
        connect: {
          id: companyId,
        },
      },
    } as Prisma.QbAccountCreateInput,
  })
}

export const updateQbAccount = async (id: string, qbAccount: QbAccountData) => {
  return await prisma.qbAccount.update({
    where: { id },
    data: qbAccount,
  })
}

export const deleteQbAccount = async (id: string) => {
  // Update transactions to remove the QB account reference
  await prisma.transaction.updateMany({
    where: {
      qbAccountId: id,
    },
    data: {
      qbAccountId: null,
    },
  })

  return await prisma.qbAccount.delete({
    where: { id },
  })
}