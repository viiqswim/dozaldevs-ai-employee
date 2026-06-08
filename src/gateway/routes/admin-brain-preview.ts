import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import path from 'path';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema, uuidField } from '../validation/schemas.js';
import { sendError } from '../lib/http-response.js';
import { getPlatformSetting } from '../../lib/platform-settings.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { discoverTools, parseSkillMd, enrichTools } from '../services/tool-parser.js';
import { compileAgentsMd } from '../../workers/lib/agents-md-compiler.mjs';
import { buildEnvManifestFromVars } from '../../workers/lib/env-manifest-builder.mjs';
import { assembleTaskPrompt } from '../../workers/lib/prompt-assembler.mjs';

interface EnvVarEntry {
  name: string;
  source: 'platform' | 'tenant_secret' | 'tenant_config' | 'lifecycle' | 'raw_event' | 'harness';
  category: 'always' | 'conditional';
  is_set: boolean;
}

const BrainPreviewParamSchema = TenantIdParamSchema.extend({
  archetypeId: uuidField(),
});

const CompilePreviewBodySchema = z.object({
  identity: z.string().max(10000).default(''),
  execution_steps: z.string().max(10000).default(''),
  delivery_steps: z.string().max(10000).nullable().default(null),
});

export interface AdminBrainPreviewRouteOptions {
  prisma?: PrismaClient;
}

export function adminBrainPreviewRoutes(opts: AdminBrainPreviewRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-brain-preview');
  const prisma = opts.prisma ?? new PrismaClient();

  router.post(
    '/admin/tenants/:tenantId/archetypes/compile-preview',
    requireAdminKey,
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }
      const bodyResult = CompilePreviewBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }
      const { identity, execution_steps, delivery_steps } = bodyResult.data;
      try {
        const compiledAgentsMd = compileAgentsMd({
          identity,
          executionSteps: execution_steps,
          deliverySteps: delivery_steps ?? '',
          employeeRules: '',
          employeeKnowledge: '',
        });
        res.status(200).json({ compiled_agents_md: compiledAgentsMd });
      } catch (err) {
        logger.error({ err }, 'Failed to compile AGENTS.md preview');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview',
    requireAdminKey,
    async (req, res) => {
      const paramResult = BrainPreviewParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
        });
        if (!archetype) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const rules = await prisma.employeeRule.findMany({
          where: { archetype_id: archetypeId, tenant_id: tenantId, status: 'confirmed' },
          orderBy: { created_at: 'desc' },
          take: 50,
        });
        const ruleTexts = rules.map((r) => r.rule_text);

        const kbRows = await prisma.knowledgeBase.findMany({
          where: { archetype_id: archetypeId, tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
        });
        const knowledgeThemes: string[] = kbRows.flatMap((kb) => {
          const cfg = kb.source_config as {
            themes?: Array<{ theme: string; representative_quote: string; frequency: number }>;
          } | null;
          return (cfg?.themes ?? []).map(
            (t) => `- ${t.theme}: "${t.representative_quote}" (${t.frequency} occurrences)`,
          );
        });

        const tenant = await prisma.tenant.findFirst({ where: { id: tenantId } });
        const tenantConfig = (tenant?.config as Record<string, unknown> | null) ?? null;

        const PLATFORM_ENV_VARS: EnvVarEntry[] = [
          {
            name: 'DATABASE_URL',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.DATABASE_URL,
          },
          {
            name: 'SUPABASE_URL',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.SUPABASE_URL,
          },
          {
            name: 'SUPABASE_SECRET_KEY',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.SUPABASE_SECRET_KEY,
          },
          {
            name: 'INNGEST_EVENT_KEY',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.INNGEST_EVENT_KEY,
          },
          {
            name: 'INNGEST_SIGNING_KEY',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.INNGEST_SIGNING_KEY,
          },
          {
            name: 'INNGEST_BASE_URL',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.INNGEST_BASE_URL,
          },
          {
            name: 'OPENROUTER_API_KEY',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.OPENROUTER_API_KEY,
          },
          {
            name: 'NODE_ENV',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.NODE_ENV,
          },
          {
            name: 'LOG_LEVEL',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.LOG_LEVEL,
          },
          {
            name: 'AGENT_VERSION_ID',
            source: 'platform',
            category: 'always',
            is_set: !!process.env.AGENT_VERSION_ID,
          },
        ];

        const secretRepo = new TenantSecretRepository(prisma);
        const secretMetas = await secretRepo.listKeys(tenantId);
        const TENANT_SECRET_VARS: EnvVarEntry[] = secretMetas.map((m) => ({
          name: m.key.toUpperCase(),
          source: 'tenant_secret' as const,
          category: 'always' as const,
          is_set: true,
        }));

        const TENANT_CONFIG_VARS: EnvVarEntry[] = [
          {
            name: 'NOTIFICATION_CHANNEL',
            source: 'tenant_config',
            category: 'always',
            is_set:
              !!(tenantConfig?.notification_channel as string | undefined) ||
              !!archetype.notification_channel,
          },
          {
            name: 'SOURCE_CHANNELS',
            source: 'tenant_config',
            category: 'always',
            is_set: !!(
              (tenantConfig?.source_channels as unknown) ||
              ((tenantConfig?.summary as Record<string, unknown> | undefined)?.channel_ids as
                | unknown
                | undefined)
            ),
          },
          {
            name: 'PUBLISH_CHANNEL',
            source: 'tenant_config',
            category: 'always',
            is_set: !!((tenantConfig?.summary as Record<string, unknown> | undefined)
              ?.publish_channel as unknown | undefined),
          },
        ];

        const LIFECYCLE_VARS: EnvVarEntry[] = [
          { name: 'TASK_ID', source: 'lifecycle', category: 'always', is_set: true },
          { name: 'TENANT_ID', source: 'lifecycle', category: 'always', is_set: true },
          { name: 'NOTIFY_MSG_TS', source: 'lifecycle', category: 'always', is_set: true },
          {
            name: 'ISSUES_SLACK_CHANNEL',
            source: 'lifecycle',
            category: 'always',
            is_set: !!process.env.ISSUES_SLACK_CHANNEL,
          },
        ];

        const RAW_EVENT_VARS: EnvVarEntry[] = [
          { name: 'PROPERTY_UID', source: 'raw_event', category: 'conditional', is_set: false },
          { name: 'LEAD_UID', source: 'raw_event', category: 'conditional', is_set: false },
          { name: 'THREAD_UID', source: 'raw_event', category: 'conditional', is_set: false },
          { name: 'MESSAGE_UID', source: 'raw_event', category: 'conditional', is_set: false },
          {
            name: 'OVERRIDE_DIRECTION',
            source: 'raw_event',
            category: 'conditional',
            is_set: false,
          },
          {
            name: 'REPLY_BROADCAST',
            source: 'raw_event',
            category: 'conditional',
            is_set: false,
          },
        ];

        const HARNESS_VARS: EnvVarEntry[] = [
          { name: 'OPENROUTER_MODEL', source: 'harness', category: 'always', is_set: true },
          { name: 'OPENCODE_PROVIDER_ID', source: 'harness', category: 'always', is_set: true },
          {
            name: 'OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS',
            source: 'harness',
            category: 'always',
            is_set: true,
          },
        ];

        const env_vars: EnvVarEntry[] = [
          ...PLATFORM_ENV_VARS,
          ...TENANT_SECRET_VARS,
          ...TENANT_CONFIG_VARS,
          ...LIFECYCLE_VARS,
          ...RAW_EVENT_VARS,
          ...HARNESS_VARS,
        ];

        const envManifestStr = buildEnvManifestFromVars(env_vars);

        const employeeRulesStr =
          ruleTexts.length > 0 ? ruleTexts.map((r, i) => `${i + 1}. ${r}`).join('\n') : '';
        const employeeKnowledgeStr = knowledgeThemes.join('\n');
        const compiledAgentsMd = compileAgentsMd({
          identity: archetype.identity ?? '',
          executionSteps: archetype.execution_steps ?? '',
          deliverySteps: archetype.delivery_steps ?? archetype.delivery_instructions ?? '',
          employeeRules: employeeRulesStr,
          employeeKnowledge: employeeKnowledgeStr,
        });

        const EXECUTION_PROMPT = assembleTaskPrompt({
          instructions:
            'Follow the instructions in <execution-instructions> within the AGENTS.md file',
          taskId: '<task-id-injected-at-runtime>',
        });
        const DELIVERY_PROMPT = assembleTaskPrompt({
          instructions:
            'Follow the instructions in <delivery-instructions> within the AGENTS.md file\n\n<approved-content>\n{{populated from deliverables.content at runtime — varies per task}}\n</approved-content>',
          taskId: '<task-id-injected-at-runtime>',
        });

        const basePath = path.join(process.cwd(), 'src/worker-tools');
        const skillPath = path.join(
          process.cwd(),
          'src/workers/skills/tool-usage-reference/SKILL.md',
        );
        const rawTools = await discoverTools(basePath);
        const enrichments = await parseSkillMd(skillPath);
        const enrichedTools = enrichTools(rawTools, enrichments);
        const tools = enrichedTools.map((t) => ({
          name: t.name,
          service: t.service,
          description: t.description,
          containerPath: t.containerPath,
        }));

        res.status(200).json({
          compiled_agents_md: compiledAgentsMd,
          execution_prompt: EXECUTION_PROMPT,
          delivery_prompt: DELIVERY_PROMPT,
          archetype_fields: {
            identity: archetype.identity,
            execution_steps: archetype.execution_steps,
            delivery_steps: archetype.delivery_steps,
            temperature: archetype.temperature,
            execution_instructions: archetype.execution_instructions,
          },
          env_vars,
          env_manifest: envManifestStr,
          tools,
          skills: [
            {
              name: 'tool-usage-reference',
              description:
                'Exact CLI syntax, required flags, output JSON shapes, and critical warnings for all shell tools in the container',
            },
            {
              name: 'uuid-disambiguation',
              description:
                'All UUID types in the system (lead_uid, thread_uid, property_uid, message_uid, task_id, tenant_id), their sources, env var names, and the critical rule that lead_uid and thread_uid are never the same value',
            },
          ],
          config: {
            model: archetype.model ?? 'minimax/minimax-m2.7',
            runtime: archetype.runtime ?? 'opencode',
            bash_timeout_ms: parseInt(await getPlatformSetting('worker_bash_timeout_ms'), 10),
            permissions: 'all tools allowed (permission: *=allow)',
            opencode_version: '1.14.31',
          },
          output_contract: {
            required_files: [
              {
                path: '/tmp/summary.txt',
                description:
                  'Free-text summary of what was done. In delivery phase must be valid JSON with {"delivered": true}',
                required: false,
              },
              {
                path: '/tmp/approval-message.json',
                description:
                  'JSON with ts, channel, and optionally conversationRef — Slack message metadata for the approval card',
                required: false,
              },
            ],
          },
          employee_rules: ruleTexts,
          employee_knowledge: knowledgeThemes,
          humanFields: {
            taskTrigger: archetype.execution_instructions ?? '',
            employeeManual: archetype.execution_steps ?? '',
            afterApprovalAction: archetype.delivery_instructions ?? '',
          },
        });
      } catch (err) {
        logger.error({ err }, 'Failed to assemble brain preview');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
