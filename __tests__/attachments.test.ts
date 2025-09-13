import { describe, it, expect, vi } from 'vitest'
import { loadAttachmentsForAI, AnalyzeAttachment } from '@/ai/attachments'
import { User, File } from '@/prisma/client'
import { fileExists, fullPathForFile, getUserUploadsDirectory } from '@/lib/files'
import { generateFilePreviews } from '@/lib/previews/generate'

// Mock dependencies
vi.mock('@/lib/files', () => ({
  fileExists: vi.fn(),
  fullPathForFile: vi.fn(),
  getUserUploadsDirectory: vi.fn(),
  safePathJoin: vi.fn((...paths) => paths.join('/')),
  getUserPreviewsDirectory: vi.fn(),
}))
vi.mock('@/lib/previews/generate', () => ({ generateFilePreviews: vi.fn() }))

describe('loadAttachmentsForAI', () => {
  const mockUser: User = { id: 'user1', email: 'test@example.com' } as User
  const mockFile: File = { id: 'file1', path: 'unsorted/file.pdf', filename: 'test.pdf', mimetype: 'application/pdf' } as File

  it('loads attachments successfully when file exists', async () => {
    vi.mocked(fileExists).mockResolvedValue(true)
    vi.mocked(fullPathForFile).mockReturnValue('/path/to/file.pdf')
    vi.mocked(generateFilePreviews).mockResolvedValue({ contentType: 'image/webp', previews: ['/preview1.webp'] })

    const result = await loadAttachmentsForAI(mockUser, mockFile)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({ filename: 'test.pdf', contentType: 'image/webp' }))
  })

  it('throws error if file and fallback not found', async () => {
    vi.mocked(fileExists).mockResolvedValue(false)
    vi.mocked(generateFilePreviews).mockResolvedValue({ contentType: 'image/webp', previews: [] }) // Empty for fallback check

    await expect(loadAttachmentsForAI(mockUser, mockFile)).rejects.toThrow('File not found on disk')
  })
})