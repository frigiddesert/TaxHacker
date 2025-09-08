#!/usr/bin/env ts-node
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import fs from 'fs/promises'

function getArg(name: string, def?: string) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1) return process.argv[idx + 1]
  return def
}

async function ensureLogsDir() {
  const logsDir = path.resolve(__dirname, '../logs')
  try { await fs.mkdir(logsDir, { recursive: true }) } catch {}
  return logsDir
}

function cutoffDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

async function classifyWithOpenAI(subject: string, fromText: string, toText: string, snippet: string): Promise<{ is_invoice: boolean, confidence: number, raw?: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini'
  if (!apiKey) return { is_invoice: false, confidence: 0, raw: 'no_api_key' }

  const instructions = `You are an email classifier that decides if an email is a legitimate bill/invoice we should ingest into an accounting system. Use only sender, subject and a short snippet of the body. Reply ONLY with a strict JSON object of the form {"is_invoice": boolean, "confidence": number between 0 and 1}. Be conservative.`
  const user = `from: ${fromText}\nto: ${toText}\nsubject: ${subject}\nsnippet: ${snippet}`
  const body = {
    model,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: user },
    ],
    temperature: 0,
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const json: any = await res.json()
  const text = json?.choices?.[0]?.message?.content || ''
  try {
    const parsed = JSON.parse(text)
    const is_invoice = Boolean(parsed.is_invoice)
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)))
    return { is_invoice, confidence, raw: text }
  } catch {
    return { is_invoice: false, confidence: 0, raw: text }
  }
}

async function main() {
  // Load env
  const envName = getArg('env', '')
  if (envName) {
    loadEnv({ path: path.resolve(__dirname, `../.env.${envName}`) })
  } else {
    loadEnv({ path: path.resolve(__dirname, '../.env') })
  }

  // IMAP config
  const host = process.env.EMAIL_INGESTION_HOST || process.env.IMAP_HOST
  const port = parseInt(process.env.EMAIL_INGESTION_PORT || process.env.IMAP_PORT || '993', 10)
  const secure = (process.env.EMAIL_INGESTION_SECURE ?? process.env.IMAP_SECURE) === 'true'
  const user = process.env.EMAIL_INGESTION_USER || process.env.IMAP_USER
  const pass = process.env.EMAIL_INGESTION_PASSWORD || process.env.IMAP_PASS
  const mailbox = process.env.EMAIL_INGESTION_MAILBOX || process.env.IMAP_MAILBOX || 'INBOX'

  if (!host || !user || !pass) {
    console.error('Missing IMAP credentials. Please set EMAIL_INGESTION_* or IMAP_* in your .env files.')
    process.exit(1)
  }

  const days = parseInt(getArg('days', '30')!, 10)
  const limit = parseInt(getArg('limit', '0')!, 10) // 0 = no limit
  const since = cutoffDate(days)

  const client = new ImapFlow({ host, port, secure, auth: { user, pass } })
  await client.connect()
  const lock = await client.getMailboxLock(mailbox)
  try {
    // Search since date
    let uids: number[] = []
    try {
      const found = await client.search({ since })
      uids = Array.isArray(found) ? found : []
    } catch {
      // Fallback: fetch all and filter by date
      const allRes = await client.search({})
      const all = Array.isArray(allRes) ? allRes : []
      if (all.length > 0) {
        const msgs = await client.fetch(all, { envelope: true, uid: true })
        for await (const m of msgs) {
          const d: Date | undefined = (m.envelope as any)?.date
          if (d && d >= since) uids.push(m.uid)
        }
      }
    }

    // Sort and apply limit
    uids.sort((a, b) => a - b)
    const work = limit > 0 ? uids.slice(-limit) : uids

    const logsDir = await ensureLogsDir()
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const logPath = path.join(logsDir, `imap-classify-${ts}.jsonl`)

    console.log(`Found ${uids.length} messages since ${since.toISOString().slice(0,10)}; processing ${work.length}`)
    const f = await fs.open(logPath, 'a')
    try {
      const fetcher = client.fetch(work as any, { uid: true, envelope: true, source: true })
      for await (const msg of fetcher) {
        const uid = msg.uid
        const env: any = msg.envelope || {}
        const parsed = await simpleParser(msg.source as Buffer)
        const fromText = (parsed as any).from?.text || env.from?.map((a: any) => a.address || a.name).join(', ') || ''
        const toText = (parsed as any).to?.text || env.to?.map((a: any) => a.address || a.name).join(', ') || ''
        const subject = parsed.subject || env.subject || ''
        const hasPdf = (parsed.attachments || []).some((a: any) => a.contentType === 'application/pdf' || (a.filename || '').toLowerCase().endsWith('.pdf'))
        const snippet = (parsed.text || '').slice(0, 400)

        const llm = await classifyWithOpenAI(subject, fromText, toText, snippet)
        const confidencePct = Math.round((llm.confidence || 0) * 100)
        const ingest = llm.is_invoice && hasPdf

        const row = {
          uid,
          date: env.date ? new Date(env.date).toISOString() : null,
          from: fromText,
          to: toText,
          subject,
          hasPdf,
          llm,
          decision: ingest ? 'ingest' : 'skip',
        }
        await f.appendFile(JSON.stringify(row) + '\n', 'utf8')
        console.log(`[${row.date?.slice(0,10) || 'unknown'}] uid=${uid} from=${fromText} pdf=${hasPdf?'yes':'no'} conf=${confidencePct}% decision=${row.decision} :: ${subject}`)
      }
    } finally {
      await f.close()
      console.log(`Verbose log written to ${logPath}`)
    }
  } finally {
    lock.release()
    await client.logout()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
