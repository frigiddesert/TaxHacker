import { ImapFlow } from "imapflow"
import config from "@/lib/config"

export type FetchOptions = Record<string, any>

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  uid: true,
  envelope: true,
  source: true,
  internalDate: true,
}

export function createImapClient(overrides: Record<string, any> = {}): ImapFlow {
  return new ImapFlow({
    host: config.emailIngestion.host,
    port: config.emailIngestion.port,
    secure: config.emailIngestion.secure,
    auth: {
      user: config.emailIngestion.user,
      pass: config.emailIngestion.password,
    },
    ...overrides,
  })
}

export async function withMailboxLock<T>(client: ImapFlow, mailbox: string, fn: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(mailbox)
  try {
    return await fn()
  } finally {
    lock.release()
  }
}

export interface SequentialFetchOptions {
  fetchOptions?: FetchOptions
  onMissing?: (uid: number) => Promise<void> | void
  onError?: (uid: number, error: unknown) => Promise<void> | void
}

export async function fetchSequentialMessages(
  client: ImapFlow,
  uids: Iterable<number>,
  handler: (uid: number, message: any) => Promise<void>,
  options: SequentialFetchOptions = {}
): Promise<void> {
  const fetchOptions = options.fetchOptions ?? DEFAULT_FETCH_OPTIONS

  for (const uid of uids) {
    try {
      const message = await client.fetchOne(uid, fetchOptions)
      if (!message) {
        if (options.onMissing) {
          await options.onMissing(uid)
        }
        continue
      }
      await handler(uid, message)
    } catch (error) {
      if (options.onError) {
        await options.onError(uid, error)
        continue
      }
      throw error
    }
  }
}

export function* uidRange(start: number, end: number): Iterable<number> {
  for (let uid = start; uid <= end; uid += 1) {
    yield uid
  }
}
