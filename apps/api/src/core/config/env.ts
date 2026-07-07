/**
 * Environment configuration — validated ONCE at boot, fail-fast (doc 09 §2).
 *
 * `process.env` is a bag of untyped strings. This module is the only place in
 * the codebase allowed to read it (doc 03 §12 — enforced by lint/CI later).
 * Everything downstream imports the typed, frozen `config` object instead.
 *
 * Phase 0 scope: core runtime + Redis. Vendor groups (Supabase, Exotel,
 * Deepgram, Anthropic, ElevenLabs, Google) join this schema in their phases —
 * each as required-in-production, optional-in-development where sensible.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  /** Server bind — HOST must stay 0.0.0.0 for Docker reachability (doc 13). */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  /** Redis connection (doc 13). Consumed from Milestone 3 onward. */
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Fail fast and LOUD: list every problem, then refuse to start.
    // A half-configured voice server must never answer a call (doc 09 §2).
    console.error("❌ Invalid environment configuration:\n");
    for (const issue of result.error.issues) {
      console.error(`  • ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error("\nFix your .env (see .env.example) and restart.");
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export const config: Env = loadEnv();

export const isProduction = config.NODE_ENV === "production";
export const isDevelopment = config.NODE_ENV === "development";
export const isTest = config.NODE_ENV === "test";
