import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'
const userEmail = 'taxhacker@localhost'

async function newestFile(dir) {
  const files = await readdir(dir)
  let best = null
  for (const f of files) {
    const p = path.join(dir, f)
    const st = await stat(p)
    if (st.isFile() && f.endsWith('.pdf')) {
      if (!best || st.mtimeMs > best.mtimeMs) best = { file: f, mtimeMs: st.mtimeMs }
    }
  }
  return best?.file || null
}

async function main() {
  const unsortedDir = path.join(path.resolve(UPLOAD_PATH), userEmail, 'unsorted')
  const file = await newestFile(unsortedDir)
  if (!file) throw new Error('No PDF found under unsorted')
  const full = path.join(unsortedDir, file)
  const buf = await readFile(full)
  const base64 = buf.toString('base64')
  const out = {
    filename: file,
    contentType: 'application/pdf',
    base64Bytes: base64.length,
    base64Sample: base64.slice(0, 100) + '...'
  }
  console.log(JSON.stringify({ ok: true, preview: out }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

