import path from 'node:path'
import { pdfToImages } from '@/lib/previews/pdf'
import { getUserUploadsDirectory, safePathJoin } from '@/lib/files'

async function main() {
  const user = { id: '00000000-0000-0000-0000-000000000001', email: 'taxhacker@localhost' }
  const base = getUserUploadsDirectory(user)
  const full = safePathJoin(base, path.posix.join('unsorted', 'sample.pdf'))
  const res = await pdfToImages(user, full)
  console.log(JSON.stringify({ ok: true, ...res }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

