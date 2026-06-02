-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON platform_settings FOR SELECT TO anon USING (deleted_at IS NULL);

-- Seed: 8 initial platform settings
INSERT INTO platform_settings (id, key, value, description, is_required) VALUES
  (gen_random_uuid(), 'default_worker_vm_size', 'performance-1x', 'Default Fly.io VM size for worker machines. OpenCode requires performance-1x minimum (2GB RAM).', true),
  (gen_random_uuid(), 'cost_limit_usd_per_day', '50', 'Maximum LLM spend per day in USD. Circuit breaker triggers at this threshold.', true),
  (gen_random_uuid(), 'synthesis_threshold', '5', 'Number of confirmed rules before rule synthesis is triggered.', true),
  (gen_random_uuid(), 'max_employee_rules_chars', '8000', 'Maximum character length for employee learned rules.', true),
  (gen_random_uuid(), 'max_employee_knowledge_chars', '32000', 'Maximum character length for employee knowledge base entries.', true),
  (gen_random_uuid(), 'worker_bash_timeout_ms', '1200000', 'Default bash command timeout in worker containers (milliseconds).', true),
  (gen_random_uuid(), 'issues_slack_channel', '', 'Slack channel for employee-reported issues. Empty = disabled.', true),
  (gen_random_uuid(), 'cost_alert_slack_channel', '#alerts', 'Slack channel for cost circuit breaker alerts.', true)
ON CONFLICT (key) DO NOTHING;
