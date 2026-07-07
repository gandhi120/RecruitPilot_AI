/**
 * server.ts — API entrypoint (doc 09 §3; its sibling worker.ts arrives in
 * Phase 5 for the async plane, doc 01 §3.2).
 *
 * Owns exactly two things: start listening, and shut down GRACEFULLY.
 * SIGTERM (sent by `docker stop` and every deploy) must drain in-flight work —
 * once calls are live, this is the difference between "deploy" and "hang up
 * on a recruiter mid-sentence" (docs 01 §11, 13, 15).
 */
import { buildApp } from "./app.js";
import { config } from "./core/config/env.js";

const app = await buildApp();

// --- Graceful shutdown -------------------------------------------------------
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return; // double-signal guard
  shuttingDown = true;
  app.log.info({ signal }, "shutdown: draining connections…");
  try {
    // app.close(): stop accepting new connections, run onClose hooks
    // (Redis/queue teardown registers here in M3+), then resolve.
    await app.close();
    app.log.info("shutdown: complete");
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "shutdown: failed");
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT")); // Ctrl-C in dev

// --- Boot ---------------------------------------------------------------------
try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Swagger UI: http://localhost:${config.PORT}/docs`);
} catch (err) {
  app.log.error({ err }, "boot: failed to start");
  process.exit(1);
}
