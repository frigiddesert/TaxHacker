import { addCategoryAction, deleteCategoryAction, editCategoryAction, addQbAccountAction, editQbAccountAction, deleteQbAccountAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { getCurrentUser } from "@/lib/auth"
import { randomHexColor } from "@/lib/utils"
import { getCategories } from "@/models/categories"
import { getQbAccounts } from "@/models/qb-accounts"
import { Prisma } from "@/prisma/client"

export default async function CategoriesSettingsPage() {
  const user = await getCurrentUser()
  const categories = await getCategories(user.id)
  const qbAccounts = await getQbAccounts(user.id)
  
  const categoriesWithActions = categories.map((category) => ({
    ...category,
    isEditable: true,
    isDeletable: true,
  }))

  const qbAccountsWithActions = qbAccounts.map((qbAccount) => ({
    ...qbAccount,
    isEditable: true,
    isDeletable: true,
    balanceFormatted: qbAccount.balance ? `$${qbAccount.balance.toNumber().toLocaleString()}` : null,
  }))

  return (
    <div className="container space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Categories</h1>
        <p className="text-sm text-gray-500 mb-6 max-w-prose">
          Create your own categories that better reflect the type of income and expenses you have. Define an LLM Prompt so
          that AI can determine this category automatically.
        </p>

        <CrudTable
          items={categoriesWithActions}
          columns={[
            { key: "name", label: "Name", editable: true },
            { key: "llm_prompt", label: "LLM Prompt", editable: true },
            { key: "color", label: "Color", type: "color", defaultValue: randomHexColor(), editable: true },
          ]}
          onDelete={async (code) => {
            "use server"
            return await deleteCategoryAction(user.id, code)
          }}
          onAdd={async (data) => {
            "use server"
            return await addCategoryAction(user.id, data as Prisma.CategoryCreateInput)
          }}
          onEdit={async (code, data) => {
            "use server"
            return await editCategoryAction(user.id, code, data as Prisma.CategoryUpdateInput)
          }}
        />
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2">QuickBooks Chart of Accounts</h1>
        <p className="text-sm text-gray-500 mb-6 max-w-prose">
          Your QuickBooks Chart of Accounts imported from your accounting system. These accounts can be selected when categorizing transactions.
        </p>

        <CrudTable
          items={qbAccountsWithActions}
          columns={[
            { key: "accountNumber", label: "Account #", editable: true },
            { key: "fullName", label: "Account Name", editable: true },
            { key: "type", label: "Type", editable: true },
            { key: "detailType", label: "Detail Type", editable: true },
            { key: "description", label: "Description", editable: true },
            { key: "balanceFormatted", label: "Balance", editable: false },
            { key: "isActive", label: "Active", type: "checkbox", editable: true, defaultValue: true },
          ]}
          onDelete={async (id) => {
            "use server"
            return await deleteQbAccountAction(id)
          }}
          onAdd={async (data) => {
            "use server"
            return await addQbAccountAction(user.id, user.companyId, data as Prisma.QbAccountCreateInput)
          }}
          onEdit={async (id, data) => {
            "use server"
            return await editQbAccountAction(id, data as Prisma.QbAccountUpdateInput)
          }}
        />
      </div>
    </div>
  )
}
