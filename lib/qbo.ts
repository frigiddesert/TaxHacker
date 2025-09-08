import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { randomUUID, createHmac } from "crypto"

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"

function apiBase(env: string) {
  return env === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company"
}

export type QBOTokens = {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in?: number
  token_type: string
  realmId: string
  obtained_at: number
}

export async function getQBOAppData(userId: string) {
  return await prisma.appData.findUnique({ where: { userId_app: { userId, app: "quickbooks" } } })
}

export async function setQBOAppData(userId: string, data: any) {
  return await prisma.appData.upsert({
    where: { userId_app: { userId, app: "quickbooks" } },
    update: { data },
    create: { userId, app: "quickbooks", data },
  })
}

export function getAuthorizeUrl(state?: string) {
  const scopes = (config.quickbooks.scopes || "").split(/\s+/).filter(Boolean)

  const params = new URLSearchParams({
    client_id: config.quickbooks.clientId,
    redirect_uri: config.quickbooks.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: state || randomUUID(),
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string, realmId: string): Promise<QBOTokens> {
  const basicAuth = Buffer.from(`${config.quickbooks.clientId}:${config.quickbooks.clientSecret}`).toString("base64")
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.quickbooks.redirectUri,
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO token exchange failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as any
  return { ...data, realmId, obtained_at: Date.now() } as QBOTokens
}

export async function refreshAccessToken(tokens: QBOTokens): Promise<QBOTokens> {
  const basicAuth = Buffer.from(`${config.quickbooks.clientId}:${config.quickbooks.clientSecret}`).toString("base64")
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO token refresh failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as any
  return { ...tokens, ...data, obtained_at: Date.now() }
}

async function authHeaders(tokens: QBOTokens) {
  return {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }
}

export async function qboQuery(userId: string, query: string) {
  const app = await getQBOAppData(userId)
  if (!app) throw new Error("QBO not connected")
  const data: any = (app.data as any) || {}
  let tokens = data.tokens as QBOTokens
  const base = apiBase(config.quickbooks.env)
  const url = `${base}/${tokens.realmId}/query?query=${encodeURIComponent(query)}&minorversion=73`
  const res = await fetch(url, { headers: await authHeaders(tokens) })
  if (res.status === 401) {
    tokens = await refreshAccessToken(tokens)
    await setQBOAppData(userId, { ...data, tokens })
    return qboQuery(userId, query)
  }
  if (!res.ok) throw new Error(`QBO query failed: ${res.status}`)
  return await res.json()
}

export async function qboPost(userId: string, path: string, payload: any) {
  const app = await getQBOAppData(userId)
  if (!app) throw new Error("QBO not connected")
  const data: any = (app.data as any) || {}
  let tokens = data.tokens as QBOTokens
  const base = apiBase(config.quickbooks.env)
  const url = `${base}/${tokens.realmId}/${path}?minorversion=73`
  let res = await fetch(url, { method: "POST", headers: await authHeaders(tokens), body: JSON.stringify(payload) })
  if (res.status === 401) {
    tokens = await refreshAccessToken(tokens)
    await setQBOAppData(userId, { ...data, tokens })
    res = await fetch(url, { method: "POST", headers: await authHeaders(tokens), body: JSON.stringify(payload) })
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO POST failed: ${res.status} ${text}`)
  }
  return await res.json()
}

export async function ensureQboVendor(userId: string, displayName: string) {
  const existing = await qboQuery(userId, `select * from Vendor where DisplayName = '${displayName.replace(/'/g, "''")}'`)
  const list = existing?.QueryResponse?.Vendor || []
  if (list.length > 0) return list[0]
  const payload = { DisplayName: displayName }
  const created = await qboPost(userId, "vendor", payload)
  return created?.Vendor
}

export async function createQboBill(userId: string, bill: {
  vendorName: string
  txnDate?: string
  privateNote?: string
  lines: Array<{ amount: number; description?: string; accountRefName: string; accountRefValue?: string; classRefName?: string }>
}) {
  const app = await getQBOAppData(userId)
  if (!app) throw new Error("QBO not connected")
  const vendor = await ensureQboVendor(userId, bill.vendorName)
  const line = bill.lines.map((l) => ({
    DetailType: "AccountBasedExpenseLineDetail",
    Amount: l.amount,
    Description: l.description || undefined,
    AccountBasedExpenseLineDetail: {
      AccountRef: l.accountRefValue ? { value: l.accountRefValue, name: l.accountRefName } : { name: l.accountRefName },
      ClassRef: l.classRefName ? { name: l.classRefName } : undefined,
    },
  }))
  const payload = {
    VendorRef: { value: vendor.Id, name: vendor.DisplayName },
    TxnDate: bill.txnDate,
    PrivateNote: bill.privateNote,
    Line: line,
  }
  const res = await qboPost(userId, "bill", payload)
  return res?.Bill
}

export function verifyIntuitWebhook(rawBody: string, signatureHeader: string | null) {
  if (!config.quickbooks.webhookVerifier) return false
  if (!signatureHeader) return false
  const hmac = createHmac("sha256", config.quickbooks.webhookVerifier)
  hmac.update(rawBody)
  const expected = hmac.digest("base64")
  return expected === signatureHeader
}

export async function findAccountByNumberOrName(userId: string, accountNumber?: string, name?: string) {
  if (!accountNumber && !name) return null
  let where = ""
  if (accountNumber && name) {
    where = `where AccountNumber = '${accountNumber.replace(/'/g, "''")}' or Name = '${name.replace(/'/g, "''")}'`
  } else if (accountNumber) {
    where = `where AccountNumber = '${accountNumber.replace(/'/g, "''")}'`
  } else if (name) {
    where = `where Name = '${name.replace(/'/g, "''")}'`
  }
  const res = await qboQuery(userId, `select * from Account ${where}`)
  const list = res?.QueryResponse?.Account || []
  return list[0] || null
}

export async function findClassByName(userId: string, name?: string) {
  if (!name) return null
  const res = await qboQuery(userId, `select * from Class where Name = '${name.replace(/'/g, "''")}'`)
  const list = res?.QueryResponse?.Class || []
  return list[0] || null
}
