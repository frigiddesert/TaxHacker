import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createCanvas } from 'canvas'

async function renderWithPdfJs(origFilePath, outDir, maxPages = 4) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js')
  const data = await fs.readFile(origFilePath)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const base = path.basename(origFilePath, path.extname(origFilePath))
  const pages = []
  const count = Math.min(doc.numPages || 0, maxPages)
  await fs.mkdir(outDir, { recursive: true })
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    const outPath = path.join(outDir, `${base}.${i}.webp`)
    const buf = canvas.toBuffer('image/webp', { quality: 0.9 })
    await fs.writeFile(outPath, buf)
    pages.push(outPath)
  }
  return pages
}

async function main() {
  const uploadBase = path.resolve(process.env.UPLOAD_PATH || './data/uploads')
  const userEmail = 'taxhacker@localhost'
  const unsorted = path.join(uploadBase, userEmail, 'unsorted')
  const previews = path.join(uploadBase, userEmail, 'previews')
  await fs.mkdir(unsorted, { recursive: true })
  await fs.mkdir(previews, { recursive: true })
  const pdf = path.join(unsorted, 'sample.pdf')
  try { await fs.access(pdf) } catch { await fs.writeFile(pdf, Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n')) }
  const out = await renderWithPdfJs(pdf, previews, 2)
  console.log(JSON.stringify({ ok: true, previews: out }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

