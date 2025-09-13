"use client"

import { Vendor, Category, Project } from "@/prisma/client"

import { Button } from "@/components/ui/button"
import { CrudTable } from "@/components/settings/crud"
import { createVendor, updateVendor, deleteVendor } from "@/models/vendors"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

const paymentMethodOptions = ["bill_pay", "ach", "autopay"]

function makeColumns(categoryCodes: string[], projectCodes: string[]) {
  const columns = [
  {
    key: "name",
    label: "Vendor Name",
    type: "text",
    editable: true,
    defaultValue: ""
  },
  {
    key: "paymentMethod",
    label: "Payment Method",
    type: "select",
    options: paymentMethodOptions,
    editable: true,
    defaultValue: "bill_pay"
  },
  {
    key: "defaultCategoryCode",
    label: "Default Account (Category Code)",
    type: "select",
    options: ["", ...categoryCodes],
    editable: true,
    defaultValue: ""
  },
  {
    key: "defaultProjectCode",
    label: "Default Class (Project Code)",
    type: "select",
    options: ["", ...projectCodes],
    editable: true,
    defaultValue: ""
  },
  {
    key: "contactEmail",
    label: "Contact Email",
    type: "text",
    editable: true,
    defaultValue: ""
  },
  {
    key: "contactPhone",
    label: "Contact Phone",
    type: "text",
    editable: true,
    defaultValue: ""
  },
  {
    key: "fromEmailsText" as any,
    label: "From Emails (comma-separated)",
    type: "text",
    editable: true,
    defaultValue: ""
  },
  {
    key: "fromDomainsText" as any,
    label: "From Domains (comma-separated)",
    type: "text",
    editable: true,
    defaultValue: ""
  },
  {
    key: "subjectKeywordsText" as any,
    label: "Subject Keywords (comma-separated)",
    type: "text",
    editable: true,
    defaultValue: ""
  },
  {
    key: "isActive",
    label: "Active",
    type: "checkbox",
    editable: true,
    defaultValue: true
  }
  ] as const
  return columns as any
}

function toList(text?: string | null) {
  if (!text) return []
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function VendorList({ vendors, userId, categories, projects }: { vendors: any[]; userId: string; categories: Category[]; projects: Project[] }) {
  const router = useRouter()
  const categoryCodes = categories.map((c) => c.code)
  const projectCodes = projects.map((p) => p.code)
  const columns = makeColumns(categoryCodes, projectCodes)

  const handleAddVendor = async (data: Partial<any>) => {
    try {
      const result = await createVendor(userId, {
        name: data.name || "",
        paymentMethod: data.paymentMethod || "bill_pay",
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        defaultCategoryCode: data.defaultCategoryCode || undefined,
        defaultProjectCode: data.defaultProjectCode || undefined,
        fromEmails: toList(data.fromEmailsText),
        fromDomains: toList(data.fromDomainsText),
        subjectKeywords: toList(data.subjectKeywordsText),
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true
      })
      
      if (result) {
        router.refresh()
        return { success: true }
      }
      return { success: false, error: "Failed to create vendor" }
    } catch (error) {
      console.error("Error creating vendor:", error)
      return { success: false, error: "Failed to create vendor" }
    }
  }

  const handleEditVendor = async (id: string, data: Partial<Vendor & any>) => {
    try {
      const payload: any = { ...data }
      if (typeof data.fromEmailsText === "string") payload.fromEmails = toList(data.fromEmailsText)
      if (typeof data.fromDomainsText === "string") payload.fromDomains = toList(data.fromDomainsText)
      if (typeof data.subjectKeywordsText === "string") payload.subjectKeywords = toList(data.subjectKeywordsText)
      delete payload.fromEmailsText
      delete payload.fromDomainsText
      delete payload.subjectKeywordsText
      const result = await updateVendor(id, userId, payload)
      if (result) {
        router.refresh()
        return { success: true }
      }
      return { success: false, error: "Failed to update vendor" }
    } catch (error) {
      console.error("Error updating vendor:", error)
      return { success: false, error: "Failed to update vendor" }
    }
  }

  const handleDeleteVendor = async (id: string) => {
    try {
      const result = await deleteVendor(id, userId)
      if (result) {
        router.refresh()
        return { success: true }
      }
      return { success: false, error: "Failed to delete vendor" }
    } catch (error) {
      console.error("Error deleting vendor:", error)
      return { success: false, error: "Failed to delete vendor" }
    }
  }

  // Format vendors for the CRUD table
  const formattedVendors = vendors.map((vendor: any) => ({
    ...vendor,
    fromEmailsText: Array.isArray(vendor.fromEmails) ? vendor.fromEmails.join(", ") : "",
    fromDomainsText: Array.isArray(vendor.fromDomains) ? vendor.fromDomains.join(", ") : "",
    subjectKeywordsText: Array.isArray(vendor.subjectKeywords) ? vendor.subjectKeywords.join(", ") : "",
    isDeletable: true,
  }))

  return (
    <div className="space-y-6">
      <CrudTable
        items={formattedVendors}
        columns={columns as any}
        onAdd={handleAddVendor}
        onEdit={handleEditVendor}
        onDelete={handleDeleteVendor}
      />
      
      <div className="bg-muted p-4 rounded-lg">
        <h4 className="font-semibold mb-2">Payment Method Guide:</h4>
        <ul className="text-sm space-y-1">
          <li><strong>bill_pay</strong> - Manual bill pay through bank website</li>
          <li><strong>ach</strong> - ACH transfers (manual setup required)</li>
          <li><strong>autopay</strong> - Automatic payments (recurring)</li>
        </ul>
      </div>
    </div>
  )
}

