import { fileExists, fullPathForFile, getUserUploadsDirectory, safePathJoin, getUserPreviewsDirectory } from "@/lib/files"
import { generateFilePreviews } from "@/lib/previews/generate"
import { File, User } from "@/prisma/client"
import fs from "fs/promises"
import path from "path"

const MAX_PAGES_TO_ANALYZE = 4

export type AnalyzeAttachment = {
  filename: string
  contentType: string
  base64: string
}

export const loadAttachmentsForAI = async (user: User, file: File): Promise<AnalyzeAttachment[]> => {
  const userUploadsDir = getUserUploadsDirectory(user)
  console.log(`[AI Analysis] User uploads dir: ${userUploadsDir}`)
  const fullFilePath = fullPathForFile(user, file)
  console.log(`[AI Analysis] Checking file existence:`)
  console.log(`  User email: ${user.email}`)
  console.log(`  File id: ${file.id}`)
  console.log(`  File path in DB: ${file.path}`)
  console.log(`  Full file path: ${fullFilePath}`)
  console.log(`  UPLOAD_PATH env: ${process.env.UPLOAD_PATH || 'default ./uploads'}`)
  
  // Ensure directory exists
  try {
    await fs.mkdir(userUploadsDir, { recursive: true })
  } catch (err) {
    console.warn('[AI] Could not create uploads dir:', err)
  }
  
  const isFileExists = await fileExists(fullFilePath)
  console.log(`  File exists: ${isFileExists}`)
  
  if (!isFileExists) {
    // Fallback: check if file is in previews or other common locations
    const previewPath = safePathJoin(getUserPreviewsDirectory(user), path.basename(file.path))
    const previewExists = await fileExists(previewPath)
    console.log(`  Preview fallback exists: ${previewExists}`)
    if (previewExists) {
      console.log('[AI] Using preview fallback path')
      return Promise.all(
        [previewPath].slice(0, MAX_PAGES_TO_ANALYZE).map(async (preview) => ({
          filename: file.filename,
          contentType: file.mimetype,
          base64: await loadFileAsBase64(preview),
        }))
      )
    }
    throw new Error(`File not found on disk at ${fullFilePath} or fallback paths`)
  }

  const { contentType, previews } = await generateFilePreviews(user, fullFilePath, file.mimetype)

  return Promise.all(
    previews.slice(0, MAX_PAGES_TO_ANALYZE).map(async (preview) => ({
      filename: file.filename,
      contentType: contentType,
      base64: await loadFileAsBase64(preview),
    }))
  )
}

export const loadFileAsBase64 = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath)
  return Buffer.from(buffer).toString("base64")
}
