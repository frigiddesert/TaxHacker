import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { exchangeCodeForTokens, setQBOAppData } from "@/lib/qbo"
import { getUserById } from "@/models/users"
import { cookies } from "next/headers"

// QuickBooks OAuth callback endpoint
// This route is intentionally unauthenticated (proxy bypass) to allow OAuth redirect flow.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const realmId = url.searchParams.get("realmId")
  const error = url.searchParams.get("error")
  const error_description = url.searchParams.get("error_description")

  console.log("[QB] OAuth callback received", { codePresent: !!code, state, realmId, error, error_description })

  if (error) {
    const html = `<!doctype html><html><body><h1>QuickBooks OAuth Error</h1><p>${error}: ${error_description || ""}</p></body></html>`
    return new NextResponse(html, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } })
  }

  if (!code || !realmId) {
    return NextResponse.json({ ok: false, error: "Missing code or realmId" }, { status: 400 })
  }

  // Basic CSRF protection: verify returned state matches cookie set during /qb/connect
  const jar = await cookies()
  const cookieState = jar.get("qbo_oauth_state")?.value
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.json({ ok: false, error: "Invalid or missing OAuth state" }, { status: 400 })
  }

  // Resolve user without forcing redirects to keep callback stable behind proxies
  const session = await getSession()
  const user = session?.user ? await getUserById(session.user.id) : null
  if (!user) {
    const html = `<!doctype html><html><body>
      <h1>QuickBooks OAuth</h1>
      <p>We received the authorization code, but you are not signed in.</p>
      <p>Please open the app in another tab, sign in, then click <a href="/qb/connect">Connect to QuickBooks</a> again.</p>
    </body></html>`
    return new NextResponse(html, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } })
  }
  try {
    const tokens = await exchangeCodeForTokens(code, realmId)
    await setQBOAppData(user.id, { tokens })
    return NextResponse.redirect(new URL("/settings/qbo", new URL(request.url).origin))
  } catch (error: any) {
    console.error("[QB] Token exchange failed", error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
