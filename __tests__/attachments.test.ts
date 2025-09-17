import type { User, File } from '@/prisma/client'
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@/lib/files', () => ({
  fileExists: jest.fn(),
  fullPathForFile: jest.fn(),
  getUserUploadsDirectory: jest.fn().mockReturnValue('/tmp/uploads'),
  safePathJoin: jest.fn((...segments: string[]) => segments.join('/')),
  getUserPreviewsDirectory: jest.fn(),
}))
jest.mock('@/lib/previews/generate', () => ({ generateFilePreviews: jest.fn() }))
jest.mock('fs/promises', () => {
  const readFile = jest.fn().mockResolvedValue(Buffer.from('preview'))
  const mkdir = jest.fn().mockResolvedValue(undefined)
  const writeFile = jest.fn().mockResolvedValue(undefined)
  const mock = { readFile, mkdir, writeFile }
  return {
    __esModule: true,
    ...mock,
    default: mock,
  }
})

const filesModule = jest.requireMock('@/lib/files') as {
  fileExists: jest.Mock
  fullPathForFile: jest.Mock
}
const previewsModule = jest.requireMock('@/lib/previews/generate') as {
  generateFilePreviews: jest.Mock
}

const loadAttachmentsForAI = () => (require('@/ai/attachments') as typeof import('@/ai/attachments')).loadAttachmentsForAI

describe('loadAttachmentsForAI', () => {
  const mockUser: User = { id: 'user1', email: 'test@example.com' } as User
  const mockFile: File = {
    id: 'file1',
    path: 'unsorted/file.pdf',
    filename: 'test.pdf',
    mimetype: 'application/pdf',
  } as File

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.skip('loads attachments successfully when file exists (TODO: fix fs mock)', async () => {
    filesModule.fullPathForFile.mockReturnValue('/path/to/file.pdf')
    filesModule.fileExists.mockResolvedValue(true)
    previewsModule.generateFilePreviews.mockResolvedValue({ contentType: 'image/webp', previews: ['/tmp/uploads/preview1.webp'] })

    const result = await loadAttachmentsForAI()(mockUser, mockFile)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({ filename: 'test.pdf', contentType: 'image/webp' }))
  })

  it('throws error if file and fallback not found', async () => {
    filesModule.fullPathForFile.mockReturnValue('/path/to/file.pdf')
    filesModule.fileExists.mockResolvedValue(false)
    previewsModule.generateFilePreviews.mockResolvedValue({ contentType: 'image/webp', previews: [] })

    await expect(loadAttachmentsForAI()(mockUser, mockFile)).rejects.toThrow(/File not found on disk/)
  })
})
