import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import path from 'path';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { discoverTools, parseSkillMd, enrichTools } from '../services/tool-parser.js';

function resolveAgentsMd(
  platformContent: string,
  tenantConfig: Record<string, unknown> | null,
  archetype: { agents_md?: string | null } | null,
): string {
  const sections: string[] = [];
  sections.push(`# Platform Policy\n\n${platformContent}`);
  const tenantDefault = tenantConfig?.default_agents_md;
  if (typeof tenantDefault === 'string' && tenantDefault.trim().length > 0) {
    sections.push(`# Tenant Conventions\n\n${tenantDefault}`);
  }
  const archetypeMd = archetype?.agents_md;
  if (archetypeMd != null && archetypeMd.trim().length > 0) {
    sections.push(`# Employee Instructions\n\n${archetypeMd}`);
  }
  return sections.join('\n\n');
}

interface EnvVarEntry {
  name: string;
  source: 'platform' | 'tenant_secret' | 'tenant_config' | 'lifecycle' | 'raw_event' | 'harness';
  category: 'always' | 'conditional';
  is_set: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidField = () =>
  z.string().regex(UUID_REGEX, 'Invalid UUID — expected 8-4-4-4-12 hex format');

const BrainPreviewParamSchema = TenantIdParamSchema.extend({
  archetypeId: uuidField(),
});

let _platformAgentsMd: string | null = null;

function getPlatformAgentsMd(): string {
  if (!_platformAgentsMd) {
    try {
      _platformAgentsMd = readFileSync(
        resolve(process.cwd(), 'src/workers/config/agents.md'),
        'utf-8',
      );
    } catch {
      _platformAgentsMd = '(Platform AGENTS.md not found)';
    }
  }
  return _platformAgentsMd;
}

export interface AdminBrainPreviewRouteOptions {
  prisma?: PrismaClient;
}

export function adminBrainPreviewRoutes(opts: AdminBrainPreviewRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();

  router.get(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview',
    requireAdminKey,
    async (req, res) => {
      const paramResult = BrainPreviewParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
        });
        if (!archetype) {
          res.status(404).json({ error: 'NOT_FOUND' });
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

        const platformMd = getPlatformAgentsMd();
        const fullAgentsMd = resolveAgentsMd(platformMd, tenantConfig, archetype);
        const tenantLayer = (tenantConfig?.default_agents_md as string | undefined)?.trim() || null;
        const employeeLayer = archetype.agents_md?.trim() || null;

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

        let systemPrompt = archetype.system_prompt ?? '';

        if (ruleTexts.length > 0) {
          const ruleBlock = ruleTexts.map((r) => `- ${r}`).join('\n');
          systemPrompt += `\n\n## Behavioral Rules — follow these\n\n${ruleBlock}`;
        }

        const instructions = archetype.instructions ?? '';
        const executionPrompt = `${systemPrompt}\n\n${instructions}\n\nTask ID: <dynamic at runtime>`;

        const deliveryPrompt = archetype.delivery_instructions
          ? `${archetype.system_prompt ?? ''}\n\n${archetype.delivery_instructions}\n\nTask ID: <dynamic at runtime>`
          : null;

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
          execution_prompt: executionPrompt,
          delivery_prompt: deliveryPrompt,
          agents_md: {
            full: fullAgentsMd,
            layers: {
              platform: platformMd,
              tenant: tenantLayer,
              employee: employeeLayer,
            },
          },
          env_vars,
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
            bash_timeout_ms: 1200000,
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
        });
      } catch (err) {
        logger.error({ err }, 'Failed to assemble brain preview');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
