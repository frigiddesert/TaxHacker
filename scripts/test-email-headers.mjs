import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'
const userEmail = 'taxhacker@localhost'

async function main() {
  const fileUuid = randomUUID()
  const filename = `${fileUuid}.txt`
  const userDir = path.join(path.resolve(UPLOAD_PATH), userEmail)
  const unsortedDir = path.join(userDir, 'unsorted')
  const fullPath = path.join(unsortedDir, filename)
  await mkdir(unsortedDir, { recursive: true })

  const headers = {
    from: 'billing@example.com',
    to: userEmail,
    subject: 'Invoice 12345 for August services',
    date: new Date().toISOString(),
    'message-id': `<${fileUuid}@example.com>`,
  }
  const body = `Hello,\n\nPlease find attached your invoice for August.\nTotal Due: $248.00\nDue Date: ${new Date(Date.now()+7*86400000).toISOString().slice(0,10)}\n\nThank you!\n`

  const content = `From: ${headers.from}\nTo: ${headers.to}\nSubject: ${headers.subject}\nDate: ${headers.date}\nMessage-ID: ${headers['message-id']}\n\n--- Email Content ---\n\n${body}`
  await writeFile(fullPath, content, 'utf-8')

  const readBack = await readFile(fullPath, 'utf-8')
  const lines = readBack.split(/\r?\n/)
  const parsed = {
    From: lines.find(l => l.startsWith('From:'))?.slice(6) || '',
    Subject: lines.find(l => l.startsWith('Subject:'))?.slice(9) || '',
    Date: lines.find(l => l.startsWith('Date:'))?.slice(6) || '',
    Preview: readBack.slice(readBack.indexOf('--- Email Content ---')+24, readBack.indexOf('--- Email Content ---')+224).trim(),
  }
  console.log(JSON.stringify({ ok: true, file: fullPath, headers: parsed }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

