import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default("info"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  BACKEND_URL: z.string().default("http://localhost:4000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_TLS: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === "true")
    .default(false),
  QUEUE_NAME: z.string().default("email-queue"),

  ELASTICSEARCH_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === "true")
    .default(true),
  ELASTICSEARCH_NODE: z.string().default("http://localhost:9200"),
  ELASTICSEARCH_USERNAME: z.string().optional().default(""),
  ELASTICSEARCH_PASSWORD: z.string().optional().default(""),
  ELASTICSEARCH_INDEX: z.string().default("emails"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z
    .string()
    .default("http://localhost:4000/auth/google/callback"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_SECURE: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === "true")
    .default(false),
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
    ),

  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
  SLACK_REDIRECT_URI: z
    .string()
    .default("http://localhost:4000/api/slack/callback"),

  ETHEREAL_SENDER_COUNT: z.coerce.number().default(3),
  SMTP_HOST: z.string().default("smtp.ethereal.email"),
  SMTP_PORT: z.coerce.number().default(587),

  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(200),
  DEFAULT_HOURLY_LIMIT: z.coerce.number().default(100),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().default(3),
  STALE_PROCESSING_MS: z.coerce.number().default(120000),
  QUEUE_INFRA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  QUEUE_INFRA_RETRY_DELAY_MS: z.coerce.number().int().min(100).default(1000),
  QUEUE_MAX_RECOVERY_CYCLES: z.coerce.number().int().min(0).max(10).default(3),
  RECOVERY_ON_BOOT: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === "true")
    .default(true),

  BULL_BOARD_PATH: z.string().default("/admin/queues"),
  // Comma-separated email allowlist for temporary operational admin routes.
  // Empty by default so admin access is denied unless explicitly configured.
  ADMIN_EMAILS: z.string().default(""),
});

const configuredEnvSchema = envSchema.superRefine((config, context) => {
  if (config.NODE_ENV !== "production") {
    return;
  }

  if (!config.COOKIE_SECURE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE must be true in production",
    });
  }
  if (
    config.JWT_SECRET.length < 32 ||
    config.JWT_SECRET.startsWith("sendora-")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "Use a unique production JWT_SECRET of at least 32 characters",
    });
  }
  if (config.ELASTICSEARCH_ENABLED) {
    if (!config.ELASTICSEARCH_NODE.startsWith("https://")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ELASTICSEARCH_NODE"],
        message: "Production Elasticsearch must use HTTPS when enabled",
      });
    }
    if (!config.ELASTICSEARCH_USERNAME || !config.ELASTICSEARCH_PASSWORD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ELASTICSEARCH_USERNAME"],
        message:
          "Production Elasticsearch credentials are required when enabled",
      });
    }
  }
  if (
    !/[?&]sslmode=(require|verify-ca|verify-full)(?:&|$)/i.test(
      config.DATABASE_URL,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message:
        "Production PostgreSQL DATABASE_URL must enable TLS with sslmode",
    });
  }
  for (const key of [
    "FRONTEND_URL",
    "BACKEND_URL",
    "GOOGLE_REDIRECT_URI",
    "SLACK_REDIRECT_URI",
  ] as const) {
    if (!config[key].startsWith("https://")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Production public URLs must use HTTPS",
      });
    }
  }
  for (const key of [
    "DATABASE_URL",
    "REDIS_PASSWORD",
    "ELASTICSEARCH_USERNAME",
    "ELASTICSEARCH_PASSWORD",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "JWT_SECRET",
  ] as const) {
    if (/REPLACE_|example\.com|USER:PASSWORD|DB_HOST/i.test(config[key])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Replace the example value with a real production setting",
      });
    }
  }
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const) {
    if (!config[key] || config[key].startsWith("mock-")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Real Google OAuth credentials are required in production",
      });
    }
  }
  if (!!config.ELASTICSEARCH_USERNAME !== !!config.ELASTICSEARCH_PASSWORD) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ELASTICSEARCH_USERNAME"],
      message: "Configure both Elasticsearch username and password, or neither",
    });
  }
});

const parsed = configuredEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof configuredEnvSchema>;
