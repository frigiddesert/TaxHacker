"use server"

import { fileExists, getUserPreviewsDirectory, safePathJoin } from "@/lib/files"
import { User } from "@/prisma/client"
import fs from "fs/promises"
import path from "path"
import { fromPath } from "pdf2pic"
import config from "../config"
import { createCanvas } from "canvas"

// Lazy import for pdfjs to keep cold path lighter
async function renderWithPdfJs(origFilePath: string, outDir: string, maxPages: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  // For Node environment worker is not required when using the legacy build
  const data = await fs.readFile(origFilePath)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise

  const pages: string[] = []
  const pageCount = Math.min(doc.numPages || 0, maxPages)
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context: any = canvas.getContext("2d")
    // pdfjs expects a canvasFactory; node-canvas works when we pass context + viewport
    await page.render({ canvasContext: context, viewport } as any).promise

    const webpBuf = canvas.toBuffer("image/webp", { quality: config.upload.pdfs.quality / 100 })
    const base = path.basename(origFilePath, path.extname(origFilePath))
    const outPath = safePathJoin(outDir, `${base}.${i}.webp`)
    await fs.writeFile(outPath, webpBuf)
    pages.push(outPath)
  }
  return { contentType: "image/webp", pages }
}

export async function pdfToImages(user: User, origFilePath: string): Promise<{ contentType: string; pages: string[] }> {
  const userPreviewsDirectory = getUserPreviewsDirectory(user)
  await fs.mkdir(userPreviewsDirectory, { recursive: true })

  const basename = path.basename(origFilePath, path.extname(origFilePath))
  // Check if converted pages already exist
  const existingPages: string[] = []
  for (let i = 1; i <= config.upload.pdfs.maxPages; i++) {
    const convertedFilePath = safePathJoin(userPreviewsDirectory, `${basename}.${i}.webp`)
    if (await fileExists(convertedFilePath)) {
      existingPages.push(convertedFilePath)
    } else {
      break
    }
  }

  if (existingPages.length > 0) {
    return { contentType: "image/webp", pages: existingPages }
  }

  // First try pdf2pic (uses ImageMagick/GraphicsMagick/Ghostscript). If it fails,
  // fall back to pure JS rendering via pdfjs-dist + node-canvas.
  const pdf2picOptions = {
    density: config.upload.pdfs.dpi,
    saveFilename: basename,
    savePath: userPreviewsDirectory,
    format: "webp",
    quality: config.upload.pdfs.quality,
    width: config.upload.pdfs.maxWidth,
    height: config.upload.pdfs.maxHeight,
    preserveAspectRatio: true,
  }

  try {
    const convert = fromPath(origFilePath, pdf2picOptions)
    const results = await convert.bulk(-1, { responseType: "image" })
    const paths = results.filter((result) => result && result.path).map((result) => result.path) as string[]
    return {
      contentType: "image/webp",
      pages: paths,
    }
  } catch (error) {
    console.warn("pdf2pic failed; trying pdfjs fallback:", error)
    // pdfjs fallback rendering
    return await renderWithPdfJs(origFilePath, userPreviewsDirectory, config.upload.pdfs.maxPages)
  }
}
