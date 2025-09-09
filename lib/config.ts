import { z } from "zod"

const envSchema = z.object({
  BASE_URL: z.string().url().default("http://localhost:7331"),
  PORT: z.string().default("7331"),
  SELF_HOSTED_MODE: z.enum(["true", "false"]).default("true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_NAME: z.string().default("gpt-4o-mini"),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL_NAME: z.string().default("gemini-2.5-flash"),
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL_NAME: z.string().default("mistral-medium-latest"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "Auth secret must be at least 16 characters")
    .default("please-set-your-key-here"),
  DISABLE_SIGNUP: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: z.string().default("please-set-your-resend-api-key-here"),
  RESEND_FROM_EMAIL: z.string().default("TaxHacker <user@localhost>"),
  RESEND_AUDIENCE_ID: z.string().default(""),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  EMAIL_INGESTION_HOST: z.string().default("localhost"),
  EMAIL_INGESTION_PORT: z.string().default("993"),
  EMAIL_INGESTION_SECURE: z.enum(["true", "false"]).default("true"),
  EMAIL_INGESTION_USER: z.string().default(""),
  EMAIL_INGESTION_PASSWORD: z.string().default(""),
  EMAIL_INGESTION_MAILBOX: z.string().default("INBOX"),
  EMAIL_INGESTION_POLLING_INTERVAL: z.string().default("300000"),
  EMAIL_INGESTION_FIRST_EMAIL_DATE: z.string().default(""), // YYYY-MM-DD format
  TRUST_PROXY_AUTH_HEADERS: z.enum(["true", "false"]).default("false"),
  // QuickBooks Online
  QBO_CLIENT_ID: z.string().default(""),
  QBO_CLIENT_SECRET: z.string().default(""),
  QBO_REDIRECT_URI: z.string().default(""),
  QBO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  QBO_WEBHOOK_VERIFIER: z.string().default(""),
  QBO_COA_PATH: z.string().default(""),
  QBO_CLASSES_PATH: z.string().default(""),
  QBO_SCOPES: z.string().default("com.intuit.quickbooks.accounting offline_access"),
})

const env = envSchema.parse(process.env)

const config = {
  app: {
    title: "TaxHacker",
    description: "Your personal AI accountant",
    version: process.env.npm_package_version || "0.0.1",
    baseURL: env.BASE_URL || `http://localhost:${env.PORT || "7331"}`,
    supportEmail: "me@vas3k.com",
  },
  upload: {
    acceptedMimeTypes: "image/*,.pdf,.doc,.docx,.xls,.xlsx",
    images: {
      maxWidth: 1800,
      maxHeight: 1800,
      quality: 90,
    },
    pdfs: {
      maxPages: 10,
      dpi: 150,
      quality: 90,
      maxWidth: 1500,
      maxHeight: 1500,
    },
  },
  selfHosted: {
    isEnabled: env.SELF_HOSTED_MODE === "true",
    redirectUrl: "/self-hosted/redirect",
    welcomeUrl: "/self-hosted",
  },
  ai: {
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModelName: env.OPENAI_MODEL_NAME,
    googleApiKey: env.GOOGLE_API_KEY,
    googleModelName: env.GOOGLE_MODEL_NAME,
    mistralApiKey: env.MISTRAL_API_KEY,
    mistralModelName: env.MISTRAL_MODEL_NAME,
  },
  auth: {
    secret: env.BETTER_AUTH_SECRET,
    loginUrl: "/enter",
    disableSignup: env.DISABLE_SIGNUP === "true" || env.SELF_HOSTED_MODE === "true",
    trustProxyAuthHeaders: env.TRUST_PROXY_AUTH_HEADERS === "true",
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    paymentSuccessUrl: `${env.BASE_URL}/cloud/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    paymentCancelUrl: `${env.BASE_URL}/cloud`,
  },
  quickbooks: {
    clientId: env.QBO_CLIENT_ID,
    clientSecret: env.QBO_CLIENT_SECRET,
    redirectUri: env.QBO_REDIRECT_URI,
    env: env.QBO_ENV,
    webhookVerifier: env.QBO_WEBHOOK_VERIFIER,
    chartOfAccountsPath: env.QBO_COA_PATH,
    classesPath: env.QBO_CLASSES_PATH,
    scopes: env.QBO_SCOPES,
  },
  email: {
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
    audienceId: env.RESEND_AUDIENCE_ID,
  },
  emailIngestion: {
    host: env.EMAIL_INGESTION_HOST,
    port: parseInt(env.EMAIL_INGESTION_PORT),
    secure: env.EMAIL_INGESTION_SECURE === "true",
    user: env.EMAIL_INGESTION_USER,
    password: env.EMAIL_INGESTION_PASSWORD,
    mailbox: env.EMAIL_INGESTION_MAILBOX,
    pollingInterval: parseInt(env.EMAIL_INGESTION_POLLING_INTERVAL),
    firstEmailDate: env.EMAIL_INGESTION_FIRST_EMAIL_DATE,
  },
} as const

export default config
