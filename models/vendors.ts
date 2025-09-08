import { prisma } from "@/lib/db"
import { Vendor } from "@/prisma/client"
import { cache } from "react"

export type VendorData = {
  name: string
  paymentMethod: string // bill_pay, ach, autopay
  bankDetails?: string
  contactEmail?: string
  contactPhone?: string
  notes?: string
  isActive?: boolean
  defaultCategoryCode?: string | null
  defaultProjectCode?: string | null
  fromEmails?: string[] | null
  fromDomains?: string[] | null
  subjectKeywords?: string[] | null
}

export const getVendors = cache(async (userId: string): Promise<Vendor[]> => {
  return await prisma.vendor.findMany({
    where: { userId },
    orderBy: { name: 'asc' }
  })
})

export const getVendorById = cache(async (id: string, userId: string): Promise<Vendor | null> => {
  return await prisma.vendor.findUnique({
    where: { id, userId }
  })
})

export const getVendorByName = cache(async (name: string, userId: string): Promise<Vendor | null> => {
  return await prisma.vendor.findFirst({
    where: { name, userId }
  })
})

export const createVendor = async (userId: string, data: VendorData): Promise<Vendor> => {
  return await prisma.vendor.create({
    data: {
      ...data,
      fromEmails: data.fromEmails ?? [],
      fromDomains: data.fromDomains ?? [],
      subjectKeywords: data.subjectKeywords ?? [],
      userId
    }
  })
}

export const updateVendor = async (id: string, userId: string, data: Partial<VendorData>): Promise<Vendor> => {
  const { fromEmails, fromDomains, subjectKeywords, ...rest } = data
  return await prisma.vendor.update({
    where: { id, userId },
    data: {
      ...rest,
      ...(fromEmails !== undefined ? { fromEmails: fromEmails ?? [] } : {}),
      ...(fromDomains !== undefined ? { fromDomains: fromDomains ?? [] } : {}),
      ...(subjectKeywords !== undefined ? { subjectKeywords: subjectKeywords ?? [] } : {}),
    }
  })
}

export const deleteVendor = async (id: string, userId: string): Promise<Vendor> => {
  return await prisma.vendor.delete({
    where: { id, userId }
  })
}

export const getVendorsByPaymentMethod = cache(async (paymentMethod: string, userId: string): Promise<Vendor[]> => {
  return await prisma.vendor.findMany({
    where: { 
      paymentMethod,
      userId,
      isActive: true
    },
    orderBy: { name: 'asc' }
  })
})

export const searchVendors = cache(async (search: string, userId: string): Promise<Vendor[]> => {
  return await prisma.vendor.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ]
    },
    orderBy: { name: 'asc' }
  })
})
