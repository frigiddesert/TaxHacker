import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"

// Lightweight test route to parse a stored email text file without DB
// Usage: /test/email-headers?file=<uuid>.txt
export async function GET(request: Request) {
  const url = new URL(request.url)
  const file = url.searchParams.get("file")
  if (!file) return NextResponse.json({ ok: false, error: "missing ?file" }, { status: 400 })

  try {
    const UPLOAD_PATH = process.env.UPLOAD_PATH || "./uploads"
    const full = path.join(path.resolve(UPLOAD_PATH), "taxhacker@localhost", "unsorted", file)
    const content = await readFile(full, "utf-8")
    const lines = content.split(/\r?\n/)
    const headers: Record<string, string> = {}
    for (const key of ["From:", "To:", "Subject:", "Date:", "Message-ID:"]) {
      const line = lines.find(l => l.startsWith(key))
      if (line) headers[key.slice(0, -1)] = line.slice(key.length).trim()
    }
    const marker = "--- Email Content ---"
    const idx = content.indexOf(marker)
    const body = idx >= 0 ? content.slice(idx + marker.length).trim() : content
    return NextResponse.json({ ok: true, file, headers, bodyPreview: body.slice(0, 300) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

