import { promises as fs } from "fs"
import path from "path"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { codeFromName } from "@/lib/utils"

async function fileExists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function importChartOfAccounts(userId: string, filePath?: string) {
  const p = filePath || config.quickbooks.chartOfAccountsPath
  if (!p) return { imported: 0 }
  if (!(await fileExists(p))) return { imported: 0 }

  const content = await fs.readFile(p, "utf8")
  // Expect CSV with columns A and B: AccountNo, FullName
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  let imported = 0
  for (const line of lines) {
    const [accountNo, fullName] = line.split(/,|\t/)
    if (!accountNo || !fullName) continue
    const code = accountNo.trim()
    const name = fullName.trim()
    if (!code || !name) continue
    await prisma.category.upsert({
      where: { userId_code: { userId, code } },
      update: { name },
      create: { userId, code, name, color: "#121216" },
    })
    imported++
  }
  return { imported }
}

export async function importClasses(userId: string, filePath?: string) {
  const p = filePath || config.quickbooks.classesPath
  if (!p) return { imported: 0 }
  if (!(await fileExists(p))) return { imported: 0 }
  const content = await fs.readFile(p, "utf8")
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  let imported = 0
  for (const name of lines) {
    const code = codeFromName(name)
    await prisma.project.upsert({
      where: { userId_code: { userId, code } },
      update: { name },
      create: { userId, code, name, color: "#1e202b" },
    })
    imported++
  }
  return { imported }
}

export async function importQBOConfigIfPresent(userId: string) {
  const results: any = {}
  try {
    results.coa = await importChartOfAccounts(userId)
  } catch (e) {
    results.coa = { error: String(e) }
  }
  try {
    results.classes = await importClasses(userId)
  } catch (e) {
    results.classes = { error: String(e) }
  }
  return results
}

