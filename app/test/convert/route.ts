import { NextResponse } from "next/server"
import path from "node:path"
import { generateFilePreviews } from "@/lib/previews/generate"
import { getUserUploadsDirectory, safePathJoin } from "@/lib/files"

// Triggers the real pdf2pic pipeline to create WEBP previews for a given PDF.
// Usage: /test/convert?file=sample.pdf
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const file = url.searchParams.get("file")
    if (!file) return NextResponse.json({ ok: false, error: "missing ?file" }, { status: 400 })

    const user = { id: "00000000-0000-0000-0000-000000000001", email: "taxhacker@localhost" } as any
    const base = getUserUploadsDirectory(user)
    const fullPath = safePathJoin(base, path.posix.join("unsorted", file))

    const { contentType, previews } = await generateFilePreviews(user, fullPath, "application/pdf")
    return NextResponse.json({ ok: true, contentType, previews })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

