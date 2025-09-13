import { NextResponse } from "next/server"
import { loadAttachmentsForAI } from "@/ai/attachments"
import path from "node:path"

// Lightweight test route that does not hit the DB.
// Usage: /test/ai?file=sample.pdf
export async function GET(request: Request) {
  const url = new URL(request.url)
  const file = url.searchParams.get("file")
  if (!file) return NextResponse.json({ ok: false, error: "missing ?file" }, { status: 400 })

  // Self-hosted test user (bypasses DB): uploads/<email>
  const user = { id: "00000000-0000-0000-0000-000000000001", email: "taxhacker@localhost" } as any
  const mimetype = file.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"
  const fake = {
    id: file,
    userId: user.id,
    filename: path.basename(file),
    path: path.posix.join("unsorted", file),
    mimetype,
    metadata: { source: "email", subject: "Test", from: "noreply@example.com", receivedDate: new Date().toISOString() },
    isReviewed: false,
    createdAt: new Date(),
    cachedParseResult: null,
    isSplitted: false,
  } as any

  try {
    const atts = await loadAttachmentsForAI(user, fake)
    return NextResponse.json({
      ok: true,
      count: atts.length,
      previews: atts.map(a => ({ filename: a.filename, contentType: a.contentType, base64Bytes: a.base64.length }))
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

