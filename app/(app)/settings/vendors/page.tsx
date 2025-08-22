import { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { getVendors } from "@/models/vendors"
import { VendorList } from "@/components/settings/vendor-list"

export const metadata: Metadata = {
  title: "Vendors",
  description: "Manage your vendors and payment methods",
}

export default async function VendorsPage() {
  const user = await getCurrentUser()
  const vendors = await getVendors(user.id)

  return (
    <div className="w-full max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-semibold">Vendors</h3>
      </div>
      
      <p className="text-muted-foreground mb-6">
        Manage your vendors and their payment methods. Set up bill pay, ACH, or autopay preferences for each vendor.
      </p>

      <VendorList vendors={vendors} userId={user.id} />
    </div>
  )
}