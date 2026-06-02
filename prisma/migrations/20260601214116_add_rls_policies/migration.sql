-- ============================================================
-- Security: Enable Row Level Security on all tables.
-- Anon role gets SELECT-only on non-sensitive tables.
-- tenant_secrets and _prisma_migrations are completely blocked.
-- service_role bypasses RLS by design — gateway/workers unaffected.
-- ============================================================

-- 1. Revoke all write permissions from anon on every table
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- 2. Revoke SELECT on sensitive tables from anon
REVOKE SELECT ON public.tenant_secrets FROM anon;
REVOKE SELECT ON public._prisma_migrations FROM anon;

-- 3. Enable RLS on all 27 tables
ALTER TABLE public._prisma_migrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archetypes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clarifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_dept_triggers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_bases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_catalog           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_locks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_models             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_metrics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_status_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_integrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_secrets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_runs         ENABLE ROW LEVEL SECURITY;

-- 4. Create SELECT policies for non-sensitive tables
-- (tenant_secrets and _prisma_migrations get NO policy → anon is fully blocked)
CREATE POLICY "anon_select" ON public.agent_versions         FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.archetypes             FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.audit_log              FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.clarifications         FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.cross_dept_triggers    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.deliverables           FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.departments            FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.employee_rules         FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.executions             FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.feedback_events        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.knowledge_base_entries FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.knowledge_bases        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.model_catalog          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.pending_approvals      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.projects               FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.property_locks         FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.reviews                FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.risk_models            FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.system_events          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.task_metrics           FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.task_status_log        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.tasks                  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.tenant_integrations    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.tenants                FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON public.validation_runs        FOR SELECT TO anon USING (true);
