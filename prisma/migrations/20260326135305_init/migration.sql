-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "archetype_id" UUID,
    "project_id" UUID,
    "external_id" TEXT,
    "source_system" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Received',
    "requirements" JSONB,
    "scope_estimate" INTEGER,
    "affected_resources" JSONB,
    "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "raw_event" JSONB,
    "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "triage_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "runtime_type" TEXT,
    "runtime_id" TEXT,
    "fix_iterations" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "agent_version_id" UUID,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "primary_model_id" TEXT,
    "estimated_cost_usd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "heartbeat_at" TIMESTAMP(3),
    "current_stage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "delivery_type" TEXT NOT NULL,
    "external_ref" TEXT,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_runs" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 1,
    "error_output" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "concurrency_limit" INTEGER NOT NULL DEFAULT 3,
    "tooling_config" JSONB,
    "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "task_id" UUID,
    "agent_version_id" UUID,
    "feedback_type" TEXT NOT NULL,
    "original_decision" JSONB,
    "corrected_decision" JSONB,
    "correction_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status_log" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slack_channel" TEXT,
    "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archetypes" (
    "id" UUID NOT NULL,
    "department_id" UUID,
    "role_name" TEXT,
    "runtime" TEXT,
    "trigger_sources" JSONB,
    "tool_registry" JSONB,
    "risk_model" JSONB,
    "concurrency_limit" INTEGER NOT NULL DEFAULT 3,
    "agent_version_id" UUID,
    "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archetypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "archetype_id" UUID,
    "last_indexed" TIMESTAMP(3),
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "source_config" JSONB,
    "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_models" (
    "id" UUID NOT NULL,
    "archetype_id" UUID,
    "factors" JSONB,
    "auto_approve_threshold" INTEGER NOT NULL DEFAULT 70,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_dept_triggers" (
    "id" UUID NOT NULL,
    "source_task_id" UUID,
    "target_archetype_id" TEXT,
    "runtime_hint" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cross_dept_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_versions" (
    "id" UUID NOT NULL,
    "archetype_id" UUID,
    "prompt_hash" TEXT,
    "model_id" TEXT,
    "tool_config_hash" TEXT,
    "changelog_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "agent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarifications" (
    "id" UUID NOT NULL,
    "task_id" UUID,
    "question" TEXT,
    "answer" TEXT,
    "source_system" TEXT,
    "external_ref" TEXT,
    "asked_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "clarifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "deliverable_id" UUID,
    "reviewer_type" TEXT,
    "agent_version_id" UUID,
    "risk_score" INTEGER,
    "verdict" TEXT,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "task_id" UUID,
    "agent_version_id" UUID,
    "api_endpoint" TEXT,
    "http_method" TEXT,
    "response_status" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_external_id_source_system_tenant_id_key" ON "tasks"("external_id", "source_system", "tenant_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_log" ADD CONSTRAINT "task_status_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetypes" ADD CONSTRAINT "archetypes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archetypes" ADD CONSTRAINT "archetypes_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_models" ADD CONSTRAINT "risk_models_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_dept_triggers" ADD CONSTRAINT "cross_dept_triggers_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
