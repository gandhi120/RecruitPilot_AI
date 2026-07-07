/**
 * Pino logger options — structured JSON logs (docs 02 §12, 09 §Security).
 *
 * Two rules established before the first real call is ever logged:
 *  1. REDACTION FIRST: phone numbers, transcripts, auth headers and API keys
 *     are censored at the logger level, so "someone logged PII" becomes
 *     structurally hard instead of a code-review hope.
 *  2. Always structured: in production this is raw JSON (shipped to CloudWatch,
 *     doc 15); in development it's pretty-printed via pino-pretty.
 *
 * Fastify creates the logger from these options (app.ts), so every
 * request-scoped child logger inherits the redaction automatically.
 */
import { config, isDevelopment } from "../../core/config/env.js";

/** Key paths censored in ALL log output. Grows as features land (docs 05–08, 17). */
const REDACT_PATHS = [
  // HTTP secrets
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  // PII that will appear once calls flow (docs 05, 11, 17)
  "*.phone",
  "*.callerNumber",
  "*.transcript",
  "*.content",
  "*.email",
  // vendor credentials, wherever an object carries them by mistake
  "*.apiKey",
  "*.api_token",
  "*.serviceAccountJson",
];

export const loggerOptions = {
  level: config.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  ...(isDevelopment && {
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    },
  }),
} as const;
