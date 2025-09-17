import { describe, it, expect, jest } from '@jest/globals'

jest.mock('@/lib/auth', () => ({
  getBackgroundUser: jest.fn().mockResolvedValue({ id: 'user1', email: 'test@example.com' }),
}))

jest.mock('@/models/files', () => ({ createFile: jest.fn() }))
jest.mock('@/ai/providers/llmProvider', () => ({ requestLLM: jest.fn() }))
jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }))
jest.mock('mailparser', () => ({ simpleParser: jest.fn() }))
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}))

const filesModel = jest.requireMock('@/models/files') as {
  createFile: jest.Mock
}

describe('EmailIngestionService', () => {
  const mockUser = { id: 'user1', email: 'test@example.com' }
  const mockConfig = {
    host: 'imap.example.com',
    port: 993,
    secure: true,
    auth: { user: 'test', pass: 'pass' },
    mailbox: 'INBOX',
    pollingInterval: 60000,
  }

  it('saves PDF attachment with email metadata including UID', async () => {
    const { EmailIngestionService } = require('@/lib/email-ingestion') as typeof import('@/lib/email-ingestion')
    const service = new EmailIngestionService(mockConfig)
    const mockAttachment = { filename: 'invoice.pdf', contentType: 'application/pdf', content: Buffer.from('pdf data') }
    const mockEnvelope = { from: [{ address: 'sender@example.com' }], subject: 'Invoice', date: new Date('2025-09-13') }

    await (service as any).processPdfAttachment(mockAttachment, mockUser, mockEnvelope, 123, BigInt(456), 'INBOX')

    expect(filesModel.createFile).toHaveBeenCalledWith(mockUser.id, expect.objectContaining({
      mimetype: 'application/pdf',
      metadata: expect.objectContaining({
        source: 'email',
        from: 'sender@example.com',
        subject: 'Invoice',
        receivedDate: expect.stringContaining('2025-09-13'),
        emailUid: 123,
        emailUidValidity: '456',
        emailMailbox: 'INBOX',
      }),
    }))
  })
})
