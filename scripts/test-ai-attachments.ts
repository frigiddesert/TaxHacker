import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { loadAttachmentsForAI } from '@/ai/attachments'
import { FILE_UPLOAD_PATH, FILE_UNSORTED_DIRECTORY_NAME, safePathJoin } from '@/lib/files'

async function main() {
  const user = { id: '00000000-0000-0000-0000-000000000001', email: 'taxhacker@localhost' } as any

  // Prepare a fake PDF under uploads/<email>/unsorted/<uuid>.pdf
  const fileUuid = randomUUID()
  const filename = `${fileUuid}.pdf`
  const userDir = safePathJoin(path.resolve(process.env.UPLOAD_PATH || './uploads'), user.email)
  const unsortedDir = safePathJoin(userDir, FILE_UNSORTED_DIRECTORY_NAME)
  await fs.mkdir(unsortedDir, { recursive: true })
  const fullPath = safePathJoin(unsortedDir, filename)

  const minimalPdf = Buffer.from('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R>> endobj\n4 0 obj <</Length 44>> stream\nBT /F1 12 Tf 72 120 Td (Hello, TaxHacker!) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer <</Size 5 /Root 1 0 R>>\nstartxref\n%%EOF\n')
  await fs.writeFile(fullPath, minimalPdf)

  const file = {
    id: fileUuid,
    userId: user.id,
    filename,
    path: `${FILE_UNSORTED_DIRECTORY_NAME}/${filename}`,
    mimetype: 'application/pdf',
    metadata: { source: 'email', from: 'sender@example.com', subject: 'Test PDF', receivedDate: new Date().toISOString(), size: minimalPdf.length },
    isReviewed: false,
    createdAt: new Date(),
    cachedParseResult: null,
    isSplitted: false,
  } as any

  const attachments = await loadAttachmentsForAI(user, file)
  console.log(JSON.stringify({
    ok: true,
    fileId: file.id,
    previews: attachments.map((a) => ({ contentType: a.contentType, base64Bytes: a.base64.length })),
  }, null, 2))
}

main().catch((e) => {
  console.error('Test failed:', e)
  process.exit(1)
})

