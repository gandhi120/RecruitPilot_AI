-- Makes local/test Postgres "Supabase-shaped" so the SAME migrations run
-- everywhere (doc 11 §3.6/§3.7): Supabase provides these roles and the
-- realtime publication out of the box; vanilla Postgres does not.
-- Runs automatically on first container boot (docker-entrypoint-initdb.d).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- Supabase's logical-replication publication (doc 11 §3.7 adds tables to it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Supabase's default grants: roles may ACCESS tables; RLS then filters ROWS.
-- Without these, local RLS tests would pass vacuously (permission denied ≠ policy denied).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
