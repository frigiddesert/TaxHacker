import { describe, it, expect, vi } from 'vitest'
import { EmailIngestionService } from '@/lib/email-ingestion'
import { getCurrentUser } from '@/lib/auth'
import { createFile } from '@/models/files'

// Mock dependencies
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/models/files', () => ({ createFile: vi.fn() }))
vi.mock('imapflow', () => ({ ImapFlow: vi.fn() }))
vi.mock('mailparser', () => ({ simpleParser: vi.fn() }))

describe('EmailIngestionService', () => {
  const mockUser = { id: 'user1', email: 'test@example.com' }
  const mockConfig = {
    host: 'imap.example.com',
    port: 993,
    secure: true,
    auth: { user: 'test', pass: 'pass' },
    mailbox: 'INBOX',
    pollingInterval: 60000
  }

  it('saves PDF attachment with email metadata including UID', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser)
    vi.mocked(createFile).mockResolvedValue({} as any)
    
    const service = new EmailIngestionService(mockConfig)
    const mockAttachment = { filename: 'invoice.pdf', contentType: 'application/pdf', content: Buffer.from('pdf data') }
    const mockParsed = { attachments: [mockAttachment], text: 'body' }
    const mockEnvelope = { from: [{ address: 'sender@example.com' }], subject: 'Invoice', date: new Date('2025-09-13') }
    
    vi.mocked(simpleParser).mockResolvedValue(mockParsed)
    
    // Simulate processPdfAttachment call
    await service['processPdfAttachment'](mockAttachment, mockUser.id, mockEnvelope, 123, BigInt(456), 'INBOX')
    
    expect(createFile).toHaveBeenCalledWith(mockUser.id, expect.objectContaining({
      mimetype: 'application/pdf',
      metadata: expect.objectContaining({
        source: 'email',
        from: 'sender@example.com',
        subject: 'Invoice',
        receivedDate: expect.stringContaining('2025-09-13'),
        emailUid: 123,
        emailUidValidity: '456',
        emailMailbox: 'INBOX'
      })
    }))
  })
})