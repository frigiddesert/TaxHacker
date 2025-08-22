"use client"

import { Button } from "@/components/ui/button"
import { CrudTable } from "@/components/settings/crud"
import { Vendor } from "@/prisma/client"
import { createVendor, updateVendor, deleteVendor } from "@/models/vendors"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

const paymentMethodOptions = ["bill_pay", "ach", "autopay"]

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
    key: "isActive",
    label: "Active",
    type: "checkbox",
    editable: true,
    defaultValue: true
  }
]

export function VendorList({ vendors, userId }: { vendors: Vendor[]; userId: string }) {
  const router = useRouter()

  const handleAddVendor = async (data: Partial<Vendor>) => {
    try {
      const result = await createVendor(userId, {
        name: data.name || "",
        paymentMethod: data.paymentMethod || "bill_pay",
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
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

  const handleEditVendor = async (id: string, data: Partial<Vendor>) => {
    try {
      const result = await updateVendor(id, userId, data)
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
  const formattedVendors = vendors.map(vendor => ({
    ...vendor,
    isDeletable: true // All vendors can be deleted
  }))

  return (
    <div className="space-y-6">
      <CrudTable
        items={formattedVendors}
        columns={columns}
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