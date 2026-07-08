-- RLS + Realtime (doc 11 §3.6–3.7) — hand-written migration, versioned in git.
--
-- Two clients, two personalities:
--   Prisma (api/worker) connects as `postgres` → BYPASSES RLS (trusted by structure).
--   The browser talks PostgREST with the anon key → FULLY BOUND by RLS.
-- RLS is the only wall between a compromised browser bundle and this data.
--
-- Rules implemented here:
--   1. RLS ENABLED on ALL nine tables (fail closed — enabled + no policy = no access).
--   2. SELECT-only policies for `authenticated` on the seven dashboard-read tables.
--      Safe because public signups are disabled (doc 04): `authenticated` = Varun.
--   3. NO insert/update/delete policies — the web NEVER writes; mutations go
--      through the Fastify API only.

-- 1. Enable RLS everywhere (fail closed)
ALTER TABLE "public"."recruiters"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."calls"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transcript_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."summaries"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."opportunities"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memories"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."settings"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tool_invocations"   ENABLE ROW LEVEL SECURITY;

-- 2. SELECT-only policies for the dashboard (authenticated = Varun, doc 04)
CREATE POLICY "authenticated_read_recruiters"
  ON "public"."recruiters" FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_calls"
  ON "public"."calls" FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_transcripts"
  ON "public"."transcript_entries" FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_summaries"
  ON "public"."summaries" FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_opportunities"
  ON "public"."opportunities" FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_notifications"
  ON "public"."notifications" FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_settings"
  ON "public"."settings" FOR SELECT TO authenticated USING (true);

-- 3. memories + tool_invocations: RLS enabled, NO policies — API-only tables.
--    Deliberately absent everywhere: INSERT/UPDATE/DELETE policies. Web never writes.

-- 4. Realtime (doc 11 §3.7): only published tables stream row changes.
--    Realtime respects RLS — subscribers only receive rows their policies allow.
--    The publication is created if missing so this migration is self-sufficient:
--    on Supabase it already exists (no-op); on local/shadow databases
--    (publications are per-database, unlike cluster-wide roles) it's created here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."calls";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."transcript_entries";
