import { NextResponse } from "next/server"

export async function GET() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Disconnected</title></head><body><h1>QuickBooks Disconnected</h1><p>You can safely close this window.</p></body></html>`
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })
}

