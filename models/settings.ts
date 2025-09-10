import { prisma } from "@/lib/db"
import { PROVIDERS } from "@/lib/llm-providers"
import { cache } from "react"
import { LLMProvider } from "@/ai/providers/llmProvider"

export type SettingsMap = Record<string, string>

/**
 * Helper to extract LLM provider settings from SettingsMap.
 */
export function getLLMSettings(settings: SettingsMap) {
  const priorities = (settings.llm_providers || "openai,google,mistral").split(",").map(p => p.trim()).filter(Boolean)

  const providers = priorities.map((provider) => {
    if (provider === "openai") {
      return {
        provider: provider as LLMProvider,
        apiKey: process.env.OPENAI_API_KEY || settings.openai_api_key || "",
        model: process.env.OPENAI_MODEL_NAME || settings.openai_model_name || PROVIDERS[0]['defaultModelName'],
      }
    }
    if (provider === "google") {
      return {
        provider: provider as LLMProvider,
        apiKey: process.env.GOOGLE_API_KEY || settings.google_api_key || "",
        model: process.env.GOOGLE_MODEL_NAME || settings.google_model_name || PROVIDERS[1]['defaultModelName'],
      }
    }
    if (provider === "mistral") {
      return {
        provider: provider as LLMProvider,
        apiKey: process.env.MISTRAL_API_KEY || settings.mistral_api_key || "",
        model: process.env.MISTRAL_MODEL_NAME || settings.mistral_model_name || PROVIDERS[2]['defaultModelName'],
      }
    }
    return null
  }).filter((provider): provider is NonNullable<typeof provider> => provider !== null)

  return {
    providers,
  }
}

export const getSettings = cache(async (userId: string): Promise<SettingsMap> => {
  const settings = await prisma.setting.findMany({
    where: { userId },
  })

  return settings.reduce((acc, setting) => {
    acc[setting.code] = setting.value || ""
    return acc
  }, {} as SettingsMap)
})

export const updateSettings = cache(async (userId: string, code: string, value: string | undefined) => {
  return await prisma.setting.upsert({
    where: { userId_code: { code, userId } },
    update: { value },
    create: {
      code,
      value,
      name: code,
      userId,
    },
  })
})
