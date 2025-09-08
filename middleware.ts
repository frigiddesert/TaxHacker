import { default as globalConfig } from "@/lib/config"
import { getSessionCookie } from "better-auth/cookies"
import { NextRequest, NextResponse } from "next/server"

export default async function middleware(request: NextRequest) {
  if (globalConfig.selfHosted.isEnabled) {
    return NextResponse.next()
  }

  // Accept proxy-auth headers from Caddy/Authelia when enabled
  if (globalConfig.auth.trustProxyAuthHeaders) {
    const remoteEmail = request.headers.get("Remote-Email") || request.headers.get("remote-email")
    if (remoteEmail) {
      return NextResponse.next()
    }
  }

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "taxhacker" })
  if (!sessionCookie) {
    return NextResponse.redirect(new URL(globalConfig.auth.loginUrl, request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/transactions/:path*",
    "/settings/:path*",
    "/export/:path*",
    "/import/:path*",
    "/unsorted/:path*",
    "/files/:path*",
    "/dashboard/:path*",
  ],
}
