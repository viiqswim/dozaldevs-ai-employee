-- Migration: postgrest_grants
-- Purpose: Add DB-side UUID defaults and grant PostgREST access roles

-- ============================================================
-- A) Enable pgcrypto for gen_random_uuid()
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- B) Add DB-side UUID defaults to all tables (idempotent)
-- Using DO blocks to handle cases where default may already exist
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "tasks" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "executions" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "deliverables" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "validation_runs" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "projects" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_versions" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "departments" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "archetypes" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "knowledge_bases" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "risk_models" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cross_dept_triggers" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "feedback" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clarifications" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reviews" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "audit_log" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "task_status_log" ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- C) Grant PostgREST roles access to all tables and sequences
-- ============================================================

-- Ensure roles exist (Supabase creates these, but be safe)
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant on all existing sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Auto-grant on future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
