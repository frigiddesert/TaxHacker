import { resizeImage } from "@/lib/previews/images"
import { pdfToImages } from "@/lib/previews/pdf"
import { User } from "@/prisma/client"

export async function generateFilePreviews(
  user: User,
  filePath: string,
  mimetype: string
): Promise<{ contentType: string; previews: string[] }> {
  if (mimetype === "application/pdf") {
    try {
      const { contentType, pages } = await pdfToImages(user, filePath)
      return { contentType, previews: pages }
    } catch (error) {
      console.error("PDF conversion failed, falling back to direct file serve:", error)
      // Return the PDF directly when conversion fails
      return { contentType: "application/pdf", previews: [filePath] }
    }
  } else if (mimetype.startsWith("image/")) {
    try {
      const { contentType, resizedPath } = await resizeImage(user, filePath)
      return { contentType, previews: [resizedPath] }
    } catch (error) {
      console.error("Image resize failed, falling back to original:", error)
      return { contentType: mimetype, previews: [filePath] }
    }
  } else {
    return { contentType: mimetype, previews: [filePath] }
  }
}
