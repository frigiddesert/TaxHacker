import { getLLMSettings } from '@/models/settings'
import { requestLLM } from '@/ai/providers/llmProvider'
import { buildLLMPrompt } from '@/ai/prompt'
import { fieldsToJsonSchema } from '@/ai/schema'
import { DEFAULT_PROMPT_ANALYSE_NEW_FILE } from '@/models/defaults'

// Mock fields, categories, projects for demo
const mockFields = [
  { code: 'name', type: 'string', llm_prompt: 'The name or number of the invoice/document' },
  { code: 'merchant', type: 'string', llm_prompt: 'The vendor or merchant name' },
  { code: 'total', type: 'number', llm_prompt: 'The total amount as a number' },
  { code: 'issuedAt', type: 'string', llm_prompt: 'The issue date in YYYY-MM-DD format' },
  { code: 'memo', type: 'string', llm_prompt: 'Any memo or description' },
]

const mockCategories = []
const mockProjects = []

const prompt = buildLLMPrompt(DEFAULT_PROMPT_ANALYSE_NEW_FILE, mockFields, mockCategories, mockProjects)
const schema = fieldsToJsonSchema(mockFields)

const settings = {
  llmProvider: 'openai',
  openai_api_key: process.env.OPENAI_API_KEY,
  model: 'gpt-4o', // Using gpt-4o as proxy for advanced "gpt-5-nano" (no such model exists; o1-mini is reasoning but not nano)
  temperature: 0.1,
  maxTokens: 1000
}

// Sample base64 (text as PDF content for demo)
const sampleBase64 = Buffer.from('Sample invoice: Merchant: Test Vendor, Total: 100.00, Date: 2025-09-13, Name: INV001, Memo: Services rendered.').toString('base64')

async function main() {
  console.log('Embedded Prompt:', prompt)
  console.log('Schema:', JSON.stringify(schema, null, 2))

  const res = await requestLLM(settings, {
    prompt,
    schema,
    attachments: [{ filename: 'demo-invoice.pdf', contentType: 'application/pdf', base64: sampleBase64 }],
  })

  console.log('Structured Output:', JSON.stringify(res, null, 2))
}

main().catch(console.error)