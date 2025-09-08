import { NextResponse } from "next/server"
import { verifyIntuitWebhook } from "@/lib/qbo"

// QuickBooks webhook endpoint
// Intentionally unauthenticated (proxy bypass) since Intuit calls it directly.
export async function POST(request: Request) {
  try {
    const body = await request.text() // Keep raw for signature verification
    const sig = (request.headers.get("intuit-signature") || request.headers.get("Intuit-Signature")) ?? null
    const ok = verifyIntuitWebhook(body, sig)
    if (!ok) {
      console.warn("[QB] Webhook signature verification failed")
      return new NextResponse("forbidden", { status: 403 })
    }
    console.log("[QB] Webhook verified", { length: body.length })
    // TODO: parse events and process if needed
    return new NextResponse("ok", { status: 200 })
  } catch (error) {
    console.error("[QB] Webhook error", error)
    return new NextResponse("error", { status: 500 })
  }
}

export async function GET() {
  // Some providers ping via GET; respond 200 to simplify health checks
  return new NextResponse("ok", { status: 200 })
}
