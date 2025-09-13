import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getLLMSettings } from '@/models/settings'
import { requestLLM } from '@/ai/providers/llmProvider'

async function main() {
  const UPLOAD_PATH = process.env.UPLOAD_PATH || './data/uploads'
  const pdf = path.join(path.resolve(UPLOAD_PATH), 'taxhacker@localhost', 'unsorted', 'sample.pdf')
  const buf = await readFile(pdf)
  const base64 = buf.toString('base64')

  const settings = getLLMSettings({})
  const res = await requestLLM(settings, {
    prompt: 'Extract a memo and a total from this invoice. Respond JSON with {"name","merchant","total","issuedAt","memo"}.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        merchant: { type: 'string' },
        total: { type: 'string' },
        issuedAt: { type: 'string' },
        memo: { type: 'string' },
      },
      required: ['name','merchant','total'],
      additionalProperties: true,
    },
    attachments: [{ filename: 'sample.pdf', contentType: 'application/pdf', base64 }],
  })

  console.log(JSON.stringify(res, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

