import { getCurrentUser } from "@/lib/auth"
import { fileExists, fullPathForFile } from "@/lib/files"
import { getFileById } from "@/models/files"
import fs from "fs/promises"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const user = await getCurrentUser()

  if (!fileId) {
    return new NextResponse("No fileId provided", { status: 400 })
  }

  try {
    // Find file in database
    const file = await getFileById(fileId, user.id)

    if (!file || file.userId !== user.id) {
      return new NextResponse("File not found or does not belong to the user", { status: 404 })
    }

    // Check if file exists
    const fullFilePath = fullPathForFile(user, file)
    const isFileExists = await fileExists(fullFilePath)
    if (!isFileExists) {
      return new NextResponse(`File not found on disk: ${file.path}`, { status: 404 })
    }

    // Read file as text
    const fileContent = await fs.readFile(fullFilePath, 'utf-8')

    // Return raw text content
    return new NextResponse(fileContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  } catch (error) {
    console.error("Error serving raw file:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}