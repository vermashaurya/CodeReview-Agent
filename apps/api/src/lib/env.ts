import { config } from "dotenv";
import { z } from "zod";

config({ path: "../../.env" });
config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  GITHUB_APP_ID: z.string().optional().default(""),
  GITHUB_APP_PRIVATE_KEY: z.string().optional().default(""),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),
  GITHUB_CLIENT_ID: z.string().optional().default(""),
  GITHUB_CLIENT_SECRET: z.string().optional().default(""),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  OPENAI_API_KEY: z.string().optional().default(""),
  TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  NEXTAUTH_SECRET: z.string().optional().default(""),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
