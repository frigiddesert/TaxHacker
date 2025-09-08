"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { importChartOfAccounts, importClasses } from "@/lib/qbo-import"
import { setQBOAppData } from "@/lib/qbo"

export async function importQBOFilesAction(): Promise<ActionState<{ coa: number; classes: number }>> {
  const user = await getCurrentUser()
  try {
    const r1 = await importChartOfAccounts(user.id)
    const r2 = await importClasses(user.id)
    return { success: true, data: { coa: r1.imported, classes: r2.imported } }
  } catch (error) {
    return { success: false, error: `Failed to import: ${error}` }
  }
}

export async function saveQBOTokensAction(formData: FormData): Promise<ActionState<{}>> {
  const user = await getCurrentUser()
  try {
    const raw = String(formData.get("tokens") || "").trim()
    if (!raw) return { success: false, error: "Tokens JSON is required" }
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      return { success: false, error: "Invalid JSON" }
    }

    const required = ["access_token", "refresh_token", "expires_in", "token_type", "realmId"]
    for (const k of required) {
      if (!(k in parsed)) return { success: false, error: `Missing field: ${k}` }
    }
    const tokens = { ...parsed, obtained_at: parsed.obtained_at || Date.now() }
    await setQBOAppData(user.id, { tokens })
    return { success: true, data: {} }
  } catch (error) {
    return { success: false, error: `Failed to save tokens: ${error}` }
  }
}

// Wrappers for <form action={...}> type expectations
export async function importQBOFilesFormAction(_formData: FormData): Promise<void> {
  await importQBOFilesAction()
}

export async function saveQBOTokensFormAction(formData: FormData): Promise<void> {
  await saveQBOTokensAction(formData)
}
