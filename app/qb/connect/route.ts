import { getCurrentUser } from "@/lib/auth"
import { getAuthorizeUrl, setQBOAppData } from "@/lib/qbo"
import { randomUUID } from "crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  const user = await getCurrentUser()
  // Generate a CSRF state and set it as an HttpOnly cookie
  const state = randomUUID()
  const jar = await cookies()
  jar.set("qbo_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  })

  const url = getAuthorizeUrl(state)
  // Store a basic timestamp to track initiation (optional)
  await setQBOAppData(user.id, { startedAt: Date.now(), lastState: state })
  return NextResponse.redirect(url)
}
