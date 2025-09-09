#!/usr/bin/env ts-node
import { ImapFlow } from 'imapflow'
import { config as loadEnv } from 'dotenv'
import path from 'path'

function getArg(name: string, def?: string) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1) return process.argv[idx + 1]
  return def
}

async function main() {
  const envName = getArg('env', '')
  if (envName) {
    loadEnv({ path: path.resolve(__dirname, `../.env.${envName}`) })
  } else {
    loadEnv({ path: path.resolve(__dirname, '../.env') })
  }

  const host = process.env.EMAIL_INGESTION_HOST || process.env.IMAP_HOST
  const port = parseInt(process.env.EMAIL_INGESTION_PORT || process.env.IMAP_PORT || '993', 10)
  const secure = (process.env.EMAIL_INGESTION_SECURE ?? process.env.IMAP_SECURE) === 'true'
  const user = process.env.EMAIL_INGESTION_USER || process.env.IMAP_USER
  const pass = process.env.EMAIL_INGESTION_PASSWORD || process.env.IMAP_PASS
  const mailbox = process.env.EMAIL_INGESTION_MAILBOX || process.env.IMAP_MAILBOX || 'INBOX'

  if (!host || !user || !pass) {
    console.error('Missing IMAP credentials. Set EMAIL_INGESTION_* or IMAP_* in .env files.')
    process.exit(1)
  }

  const limit = Math.max(1, parseInt(getArg('limit', '10')!, 10))

  const client = new ImapFlow({ host, port, secure, auth: { user, pass } })
  await client.connect()

  try {
    // Open mailbox in read-only mode so no flags are changed
    try {
      // Preferred explicit read-only open
      // @ts-ignore - mailboxOpen exists in imapflow v1
      if (typeof (client as any).mailboxOpen === 'function') {
        await (client as any).mailboxOpen(mailbox, { readOnly: true })
      } else {
        // Fallback to lock without modifying flags
        await client.getMailboxLock(mailbox)
      }
    } catch {
      await client.getMailboxLock(mailbox)
    }

    // Fetch latest UIDs and then envelopes for those messages only
    const allUids = await client.search({})
    const uids = Array.isArray(allUids) ? allUids : []
    uids.sort((a, b) => a - b)
    const work = uids.slice(-limit)

    const fetcher = client.fetch(work as any, { uid: true, envelope: true, flags: true })
    for await (const msg of fetcher) {
      const env: any = msg.envelope || {}
      const flags = msg.flags ? Array.from(msg.flags) : []
      const from = Array.isArray(env.from) ? env.from.map((a: any) => a.address || a.name).join(', ') : ''
      const to = Array.isArray(env.to) ? env.to.map((a: any) => a.address || a.name).join(', ') : ''
      const dateIso = env.date ? new Date(env.date).toISOString() : null

      const row = {
        uid: msg.uid,
        messageId: env.messageId || null,
        date: dateIso,
        from,
        to,
        subject: env.subject || '',
        flags,
      }
      console.log(JSON.stringify(row))
    }
  } finally {
    await client.logout()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

