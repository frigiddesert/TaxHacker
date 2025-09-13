import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const UPLOAD_PATH = process.env.UPLOAD_PATH || './data/uploads'
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'taxhacker@localhost' }

async function ensureDirs() {
  const base = path.resolve(UPLOAD_PATH)
  const dir = path.join(base, user.email, 'unsorted')
  await mkdir(dir, { recursive: true })
  return dir
}

function minimalPdfBuffer() {
  // Tiny (formally invalid but fine-as-bytes) PDF for pipeline checks
  const s = '%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n'
  return Buffer.from(s)
}

async function createEmailAndPdf(unsortedDir) {
  const id = randomUUID()
  const emailFilename = `${id}.txt`
  const pdfFilename = `${id}.pdf`

  const headers = {
    from: 'billing@example.com',
    to: user.email,
    subject: 'Invoice for Services',
    date: new Date().toISOString(),
    'message-id': `<${id}@example.com>`,
  }
  const body = `Hello,\nPlease pay $123.45 by ${new Date(Date.now()+5*86400000).toISOString().slice(0,10)}.\nThank you.`
  const content = `From: ${headers.from}\nTo: ${headers.to}\nSubject: ${headers.subject}\nDate: ${headers.date}\nMessage-ID: ${headers['message-id']}\n\n--- Email Content ---\n\n${body}\n`

  const emailPath = path.join(unsortedDir, emailFilename)
  await writeFile(emailPath, content, 'utf-8')

  const pdfPath = path.join(unsortedDir, pdfFilename)
  await writeFile(pdfPath, minimalPdfBuffer())

  return { id, emailFilename, pdfFilename, emailPath, pdfPath }
}

async function run() {
  const dir = await ensureDirs()
  const created = await createEmailAndPdf(dir)

  // Prepare a fake File row for the PDF to pass into the loader
  const resolvedPath = created.pdfPath

  // Simulate AI attachment loader fallback (direct PDF base64)
  const buf = await readFile(resolvedPath)
  const base64 = buf.toString('base64')
  const aiOut = {
    ok: true,
    count: 1,
    sample: {
      filename: created.pdfFilename,
      contentType: 'application/pdf',
      base64Bytes: base64.length,
    }
  }

  const emailText = await readFile(created.emailPath, 'utf-8')
  const lines = emailText.split(/\r?\n/)
  const parsed = {
    From: lines.find(l => l.startsWith('From:'))?.slice(6) || '',
    Subject: lines.find(l => l.startsWith('Subject:'))?.slice(9) || '',
    Date: lines.find(l => l.startsWith('Date:'))?.slice(6) || '',
    BodyPreview: emailText.slice(emailText.indexOf('--- Email Content ---')+24, emailText.indexOf('--- Email Content ---')+224).trim(),
  }

  console.log(JSON.stringify({
    ok: true,
    created: {
      email: created.emailPath,
      pdf: created.pdfPath,
    },
    resolvedPath,
    aiOut,
    parsed,
  }, null, 2))
}

run().catch((e) => { console.error(e); process.exit(1) })
