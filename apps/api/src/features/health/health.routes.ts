/**
 * Health feature slice — the smallest possible example of the doc 03 §4.1
 * pattern: a routes file with Zod schemas and zero business logic.
 *
 *  GET /health — liveness:  "is this process running?"       (Docker, doc 13)
 *  GET /ready  — readiness: "can it serve? deps connected?"  (deploys, doc 15)
 *
 * The response schemas do double duty (doc 09 §2): they SERIALIZE the reply
 * (unknown fields are stripped — no accidental leaks) and they generate the
 * OpenAPI docs at /docs. One schema, three jobs.
 */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { config } from "../../core/config/env.js";

const HealthResponse = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});

const ReadyResponse = z.object({
  status: z.enum(["ready", "degraded"]),
  checks: z.object({
    // Redis check becomes real in Milestone 3 (doc 13); DB in Phase 1 (doc 11).
    redis: z.enum(["ok", "down", "not_configured"]),
  }),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness probe",
        response: { 200: HealthResponse },
      },
    },
    async () => ({
      status: "ok" as const,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["system"],
        summary: "Readiness probe (dependency checks)",
        response: { 200: ReadyResponse },
      },
    },
    async () => {
      // M3 wires a real PING against config.REDIS_URL here.
      void config.REDIS_URL;
      return {
        status: "ready" as const,
        checks: { redis: "not_configured" as const },
      };
    },
  );
};
