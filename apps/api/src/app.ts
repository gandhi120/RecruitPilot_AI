/**
 * app.ts — builds and wires the Fastify instance (doc 09 §3).
 *
 * Deliberately separate from server.ts: tests import buildApp() and use
 * app.inject() to make requests with ZERO network (doc 19); server.ts is the
 * thin entrypoint that owns listening + shutdown. Registration order matters:
 * config is already validated at import time (env.ts), then logger, then
 * platform plugins, then feature routes.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { loggerOptions } from "./infra/logger/logger.js";
import { healthRoutes } from "./features/health/health.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: loggerOptions,
    // Behind Nginx in production (doc 13/15): trust X-Forwarded-* headers.
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod becomes THE validation + serialization engine for every route (doc 09 §2).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // --- Platform plugins -----------------------------------------------------
  await app.register(sensible); // httpErrors helpers, sane defaults
  await app.register(cors, {
    // Locked to the dashboard origin in Phase 1 (doc 10); permissive in dev only.
    origin: true,
  });

  // OpenAPI generated FROM the Zod route schemas — docs can't go stale (doc 12).
  await app.register(swagger, {
    openapi: {
      info: {
        title: "RecruitPilot AI — API",
        description:
          "Bolna webhooks (caller identify, tools, post-call), async jobs, and dashboard API. Contracts defined by Zod schemas in packages/shared.",
        version: "0.0.0",
      },
      tags: [{ name: "system", description: "Health & readiness" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // --- Feature slices (doc 03 §4) --------------------------------------------
  await app.register(healthRoutes);

  return app;
}
