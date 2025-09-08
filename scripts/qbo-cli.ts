#!/usr/bin/env ts-node
/**
 * Simple CLI to test QuickBooks OAuth and API calls.
 *
 * Usage examples:
 *   ts-node qbo-cli.ts --env sandbox auth-url
 *   ts-node qbo-cli.ts --env sandbox exchange --code <code> --realmId <realm>
 *   ts-node qbo-cli.ts --env sandbox refresh --refresh-token <token>
 *   ts-node qbo-cli.ts --env sandbox query-accounts
 *   ts-node qbo-cli.ts --env sandbox create-bill --vendor "Acme" --amount 12.34 --account "Office Supplies" --class "HQ" --date 2025-09-01 --memo "Test bill"
 */

import { config as loadEnv } from "dotenv"

// Load .env.<env> if provided, else default .env
const envIdx = process.argv.indexOf("--env")
let envName = ""
if (envIdx !== -1 && process.argv[envIdx + 1]) {
  envName = process.argv[envIdx + 1]
}
const envFile = envName ? `../.env.${envName}` : "../.env"
loadEnv({ path: envFile })

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"

function apiBase(env: string) {
  return env === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company"
}

function required(name: string, v?: string) {
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

const QBO = {
  clientId: required("QBO_CLIENT_ID", process.env.QBO_CLIENT_ID),
  clientSecret: required("QBO_CLIENT_SECRET", process.env.QBO_CLIENT_SECRET),
  redirectUri: required("QBO_REDIRECT_URI", process.env.QBO_REDIRECT_URI),
  env: process.env.QBO_ENV || "sandbox",
  scopes: (process.env.QBO_SCOPES || "com.intuit.quickbooks.accounting offline_access").split(/\s+/).filter(Boolean),
}

function getAuthorizeUrl(state?: string) {
  const scopes = QBO.scopes
  const params = new URLSearchParams({
    client_id: QBO.clientId,
    redirect_uri: QBO.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: state || Math.random().toString(36).slice(2),
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function exchangeCode(code: string, realmId: string) {
  const basic = Buffer.from(`${QBO.clientId}:${QBO.clientSecret}`).toString("base64")
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: QBO.redirectUri })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${text}`)
  const data = JSON.parse(text)
  return { ...data, realmId }
}

async function refreshToken(refreshToken: string) {
  const basic = Buffer.from(`${QBO.clientId}:${QBO.clientSecret}`).toString("base64")
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${text}`)
  const data = JSON.parse(text)
  return data
}

async function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" }
}

async function queryAccounts(accessToken: string, realmId: string) {
  const base = apiBase(QBO.env)
  const url = `${base}/${realmId}/query?query=${encodeURIComponent("select * from Account")}&minorversion=73`
  const res = await fetch(url, { headers: await authHeaders(accessToken) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${text}`)
  return JSON.parse(text)
}

async function createBill(
  accessToken: string,
  realmId: string,
  vendorName: string,
  amount: number,
  accountName: string,
  className?: string,
  date?: string,
  memo?: string
) {
  const base = apiBase(QBO.env)
  const url = `${base}/${realmId}/bill?minorversion=73`
  const payload = {
    VendorRef: { name: vendorName },
    TxnDate: date,
    PrivateNote: memo,
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: amount,
        Description: memo,
        AccountBasedExpenseLineDetail: {
          AccountRef: { name: accountName },
          ClassRef: className ? { name: className } : undefined,
        },
      },
    ],
  }
  const res = await fetch(url, { method: "POST", headers: await authHeaders(accessToken), body: JSON.stringify(payload) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Create bill failed: ${res.status} ${text}`)
  return JSON.parse(text)
}

function getArg(name: string) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1) return process.argv[idx + 1]
  return undefined
}

async function main() {
  // Determine the subcommand robustly: pick the first non-flag arg
  const argv = process.argv.slice(2)
  let cmd: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) {
      // Skip value for this flag if provided as separate token
      const next = argv[i + 1]
      if (next && !next.startsWith("--")) i++
      continue
    } else {
      cmd = a
      break
    }
  }
  if (!cmd) {
    console.log("Commands: auth-url | exchange | refresh | query-accounts | create-bill")
    process.exit(1)
  }

  try {
    if (cmd === "auth-url") {
      console.log(getAuthorizeUrl())
    } else if (cmd === "exchange") {
      const code = getArg("code")
      const realmId = getArg("realmId")
      if (!code || !realmId) throw new Error("--code and --realmId are required")
      const tokens = await exchangeCode(code, realmId)
      console.log(JSON.stringify(tokens, null, 2))
    } else if (cmd === "refresh") {
      const rt = getArg("refresh-token")
      if (!rt) throw new Error("--refresh-token is required")
      const tokens = await refreshToken(rt)
      console.log(JSON.stringify(tokens, null, 2))
    } else if (cmd === "query-accounts") {
      const at = getArg("access-token")
      const realmId = getArg("realmId")
      if (!at || !realmId) throw new Error("--access-token and --realmId are required")
      const data = await queryAccounts(at, realmId)
      console.log(JSON.stringify(data, null, 2))
    } else if (cmd === "create-bill") {
      const at = getArg("access-token")
      const realmId = getArg("realmId")
      const vendor = getArg("vendor")
      const amountStr = getArg("amount")
      const account = getArg("account")
      const cls = getArg("class")
      const date = getArg("date")
      const memo = getArg("memo")
      if (!at || !realmId || !vendor || !amountStr || !account) {
        throw new Error("--access-token --realmId --vendor --amount --account are required")
      }
      const amount = parseFloat(amountStr)
      const res = await createBill(at, realmId, vendor, amount, account, cls, date, memo)
      console.log(JSON.stringify(res, null, 2))
    } else {
      throw new Error(`Unknown command: ${cmd}`)
    }
  } catch (e: any) {
    console.error(e.message || e)
    process.exit(1)
  }
}

main()
