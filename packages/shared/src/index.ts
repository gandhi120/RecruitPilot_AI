// @recruitpilot/shared — the innermost ring (doc 03 §2/§4).
// One source of shape-truth imported by BOTH apps/api and apps/web.
//
// RULE (doc 03 §10): this package is bundled into the browser build, so it must
// stay browser-safe — pure types, Zod schemas, and constants ONLY. No Node-only
// imports (fs, Prisma, vendor SDKs) may ever appear here.
//
// Real content arrives in later milestones:
//   - schemas/  : DTOs (call, recruiter, opportunity, settings)  (docs 11, 12)
//   - events/   : domain events as Zod schemas                    (doc 01 §2.4)
//   - constants/: event names, queue names, error codes

/** Marker export so the package has a value and imports resolve during Milestone 1. */
export const SHARED_PACKAGE_NAME = "@recruitpilot/shared" as const;
