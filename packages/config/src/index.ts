import { z } from 'zod';

const base = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./wallpaper-manager.db'),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  STEAM_ROOT: z.string().min(1).default('./steam-data'),
};
export const apiEnvSchema = z.object({
  ...base,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  STEAM_WEB_API_KEY: z.string().optional(),
  STEAM_AUTH_SOCKET: z.string().default('/tmp/wallpaper-manager-steam-auth.sock'),
  MAX_QUEUE_LENGTH: z.coerce.number().int().positive().default(20),
  REQUEST_BODY_LIMIT: z.string().default('16kb'),
});
export const workerEnvSchema = z.object({
  ...base,
  MANAGER_ROOT: z.string().min(1).default('./wallpaper-manager'),
  STAGING_DIR: z.string().min(1).default('./staging'),
  TRASH_DIR: z.string().min(1).default('./trash'),
  STEAM_CONFIG_DIR: z.string().min(1).default('./steam-config'),
  STEAM_AUTH_SOCKET: z.string().default('/tmp/wallpaper-manager-steam-auth.sock'),
  STEAMCMD_BIN: z.string().default('steamcmd'),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  DOWNLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(1).default(1),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export function parseApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv { return apiEnvSchema.parse(env); }
export function parseWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv { return workerEnvSchema.parse(env); }
