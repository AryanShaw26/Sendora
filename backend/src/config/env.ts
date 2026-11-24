import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BACKEND_URL: z.string().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  QUEUE_NAME: z.string().default('email-queue'),

  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/auth/google/callback'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .default(false),
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/api/slack/callback'),

  ETHEREAL_SENDER_COUNT: z.coerce.number().default(3),
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().default(587),

  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(200),
  DEFAULT_HOURLY_LIMIT: z.coerce.number().default(100),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().default(3),
  STALE_PROCESSING_MS: z.coerce.number().default(120000),
  RECOVERY_ON_BOOT: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .default(true),

  BULL_BOARD_PATH: z.string().default('/admin/queues'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
