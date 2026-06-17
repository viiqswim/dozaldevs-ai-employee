import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serviceToSkillName } from '../../lib/custom-skills/skill-generator.js';
import { query } from './postgrest-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _platformRulesRaw = readFileSync(join(__dirname, '../config/agents.md'), 'utf-8');
const PLATFORM_RULES_CONTENT = _platformRulesRaw.replace(/^#[^\n]*\n\n?/, '').trimEnd();

export interface CompileAgentsMdInput {
  identity: string;
  executionSteps: string;
  deliverySteps: string;
  employeeRules?: string;
  employeeKnowledge?: string;
  platformRulesOverride?: string | null;
  /**
   * Active Composio toolkit names for this tenant (e.g. ['notion', 'linear']).
   * When non-empty, a "Connected Apps (via Composio)" section is injected after
   * the delivery instructions and before any employee-specific instructions.
   * Load these via loadConnectedToolkits(tenantId) before calling.
   */
  connectedToolkits?: string[];
  /**
   * Connected custom-code integration service names for this tenant
   * (e.g. ['hostfully', 'sifely']). When non-empty, a "Custom Integrations"
   * section is injected listing each connected integration and pointing the
   * employee at the matching per-service skill. Load these via
   * loadCustomIntegrations(tenantId) before calling.
   */
  connectedServices?: string[];
}

interface ComposioConnectionRow {
  toolkit: string;
}

/**
 * Loads the active Composio toolkit names for a tenant via PostgREST.
 *
 * Worker containers read the DB through PostgREST (not Prisma), so this uses the
 * shared worker postgrest-client. Returns a de-duplicated list of toolkit names
 * for connections that are active and not soft-deleted. On any failure (missing
 * env, HTTP error, empty result) it returns an empty array — the compiler then
 * omits the Connected Apps section entirely.
 */
export async function loadConnectedToolkits(tenantId: string): Promise<string[]> {
  if (!tenantId) return [];
  const rows = await query<ComposioConnectionRow>(
    'composio_connections',
    `tenant_id=eq.${tenantId}&status=eq.active&deleted_at=is.null&select=toolkit`,
  );
  if (!rows || rows.length === 0) return [];
  const toolkits = rows
    .map((r) => r.toolkit)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  return [...new Set(toolkits)];
}

interface TenantSecretKeyRow {
  key: string;
}

interface TenantIntegrationIdRow {
  id: string;
}

/**
 * Detects which custom-code integrations a tenant has connected.
 *
 * Mirrors loadConnectedToolkits() but for the platform's hand-written shell
 * tools (Hostfully, Sifely, Slack, GitHub) instead of Composio apps. Detection
 * is signal-based and reads only secret KEYS (never ciphertext) plus the
 * tenant_integrations provider rows:
 *
 *   - hostfully — any tenant_secrets key prefixed `hostfully_`
 *   - sifely    — any tenant_secrets key prefixed `sifely_`
 *   - slack     — tenant_secrets key `slack_bot_token` (Slack-via-Composio is
 *                 disabled; composio_connections is intentionally NOT consulted)
 *   - github    — a non-soft-deleted tenant_integrations row with provider
 *                 `github`, OR a tenant_secrets key `github_installation_id`
 *
 * Returns a de-duplicated list. On any failure (missing env, HTTP error) the
 * underlying query() returns null and that signal is simply skipped — the
 * function never throws and returns [] when nothing is detected.
 */
export async function loadCustomIntegrations(tenantId: string): Promise<string[]> {
  if (!tenantId) return [];

  const integrations = new Set<string>();

  // Secret KEYS only — never select ciphertext/iv/auth_tag. tenant_secrets has
  // no soft-delete column, so no deleted_at filter is applied here.
  const secretRows = await query<TenantSecretKeyRow>(
    'tenant_secrets',
    `tenant_id=eq.${tenantId}&select=key`,
  );
  if (secretRows) {
    for (const row of secretRows) {
      const key = typeof row.key === 'string' ? row.key.trim().toLowerCase() : '';
      if (!key) continue;
      if (key.startsWith('hostfully_')) integrations.add('hostfully');
      if (key.startsWith('sifely_')) integrations.add('sifely');
      if (key === 'slack_bot_token') integrations.add('slack');
      if (key === 'github_installation_id') integrations.add('github');
    }
  }

  // GitHub also connects via a tenant_integrations row (provider=github).
  // Queried regardless of the secret signal — github is added if either source
  // has rows. Soft-deleted rows are excluded via deleted_at=is.null.
  const githubRows = await query<TenantIntegrationIdRow>(
    'tenant_integrations',
    `tenant_id=eq.${tenantId}&provider=eq.github&deleted_at=is.null&select=id`,
  );
  if (githubRows && githubRows.length > 0) {
    integrations.add('github');
  }

  return [...integrations];
}

/**
 * Builds the "Connected Apps (via Composio)" section listing the tenant's active
 * toolkits and the shell-tool invocation contract. Returns null when there are
 * no toolkits so the caller can skip injection.
 */
function buildConnectedAppsSection(toolkits: string[]): string | null {
  const clean = toolkits.filter((t) => typeof t === 'string' && t.trim().length > 0);
  if (clean.length === 0) return null;
  const list = clean.join(', ');
  return [
    '## Connected Apps (via Composio)',
    '',
    `You have access to the following connected apps: ${list}.`,
    '',
    'To use them, call the shell tool:',
    '',
    '```bash',
    'tsx /tools/composio/execute.ts \\',
    '  --toolkit <toolkit-name> \\',
    '  --action <ACTION_NAME> \\',
    "  --params '<json-params>'",
    '```',
    '',
    `Available toolkits: ${list}`,
    'The tool returns JSON. On error it exits non-zero with `{ "error": "..." }`.',
  ].join('\n');
}

/**
 * Human-readable display names for custom-integration service slugs. Falls back
 * to a capitalized slug for any service not listed here.
 */
const CUSTOM_INTEGRATION_DISPLAY_NAMES: Record<string, string> = {
  hostfully: 'Hostfully',
  sifely: 'Sifely',
  github: 'GitHub',
  slack: 'Slack',
};

function customIntegrationDisplayName(service: string): string {
  return (
    CUSTOM_INTEGRATION_DISPLAY_NAMES[service] ?? service.charAt(0).toUpperCase() + service.slice(1)
  );
}

/**
 * Builds the "Custom Integrations" section listing the tenant's connected
 * custom-code integrations (Hostfully, Sifely, GitHub, Slack) and pointing the
 * employee at the matching per-service skill for exact CLI usage. Mirrors
 * buildConnectedAppsSection: returns null when there are no connected services
 * so the caller can skip injection.
 */
function buildCustomIntegrationsSection(services: string[]): string | null {
  const clean = services.filter((s) => typeof s === 'string' && s.trim().length > 0);
  if (clean.length === 0) return null;
  const lines: string[] = [
    '## Custom Integrations',
    '',
    'You have access to these integrations:',
    '',
  ];
  for (const service of clean) {
    const skillName = serviceToSkillName(service);
    const displayName = customIntegrationDisplayName(service);
    lines.push(`- **${displayName}** — load the \`${skillName}\` skill for exact CLI usage.`);
  }
  return lines.join('\n');
}

const CRITICAL_DIRECTIVE =
  '**CRITICAL: You MUST use the bash tool to execute every command in your instructions. Do NOT describe what you would do — EXECUTE it. A text-only response is a failure.**';

/**
 * Injected at position 2.5 (after CRITICAL_DIRECTIVE, before execution-instructions)
 * when the archetype is date-parameterized. Teaches the canonical way to read and
 * derive dates from the INPUT_TARGET_DATE environment variable. Generic — not
 * tied to any specific employee type.
 */
const DATE_PARAMETERIZATION_RULES = `## Date Parameterization

When your task includes a target date, it is available via the \`INPUT_TARGET_DATE\` environment variable. Always read it with:

\`\`\`bash
printenv INPUT_TARGET_DATE
\`\`\`

Derive the day of week from that value using:

\`\`\`bash
node -e "const d=new Date(process.env.INPUT_TARGET_DATE+'T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
\`\`\`

Never use the system date (\`date\` command) for the target date — always read \`INPUT_TARGET_DATE\`. Never derive the day of week from the system clock.`;

/**
 * Prepended to the <delivery-instructions> wrapper. Explains to the delivery agent
 * how the approved content is provided in the delivery prompt. Generic platform
 * contract — always injected so every delivery agent knows where to find its content.
 */
const APPROVED_CONTENT_CONTEXT =
  '**Delivery context:** The approved content to deliver is injected into this prompt as `<approved-content>...</approved-content>` XML. Parse it from there — do NOT re-fetch or re-generate the content. Use exactly what is in `<approved-content>`. Write it to `/tmp/delivery-draft.txt` and pass that file to the appropriate delivery tool with `--text-file /tmp/delivery-draft.txt`.';

const EXEC_IMPORTANT =
  '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<delivery-instructions>` — that section is for a separate container. STOP after the final step.**';

const DELIVERY_IMPORTANT =
  '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<execution-instructions>` — that section is for a separate container. STOP after the final step.**';

const STOP_DIRECTIVE = '**STOP. Do nothing else. Your job is done.**';

/**
 * Returns true when the archetype's execution or delivery steps reference
 * INPUT_TARGET_DATE, indicating this is a date-parameterized employee.
 * The check is generic — any mention triggers injection of
 * DATE_PARAMETERIZATION_RULES regardless of which employee type it is.
 *
 * Note: wizard-generated archetypes use {{target_date}} template syntax which
 * is resolved to the actual date value by substituteTemplateVars() in the
 * execution/delivery phase BEFORE the model sees the compiled AGENTS.md.
 * Those archetypes therefore do NOT need DATE_PARAMETERIZATION_RULES injected —
 * the date is already inline in the text. Only legacy/manual archetypes that
 * reference INPUT_TARGET_DATE directly need this section.
 */
function isDateParameterized(input: CompileAgentsMdInput): boolean {
  const combined = input.executionSteps + ' ' + input.deliverySteps;
  return combined.includes('INPUT_TARGET_DATE');
}

/**
 * Strips STOP-like directives that archetypes may have embedded in their
 * execution_steps field. The compiler wraps execution_steps with its own
 * EXEC_IMPORTANT header and STOP_DIRECTIVE footer — if the field already
 * contains those, the compiled output ends up with 4 STOP-related lines
 * instead of 2, which confuses LLMs.
 *
 * Strips any line that matches:
 *   - `**STOP\b` (e.g. "**STOP. Do nothing else.**")
 *   - `**IMPORTANT:` followed by "STOP" anywhere on the same line
 */
function stripEmbeddedStopDirectives(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (/\*\*STOP\b/i.test(t)) return false;
      if (/\*\*IMPORTANT:.*STOP/i.test(t)) return false;
      return true;
    })
    .join('\n');
}

export function compileAgentsMd(input: CompileAgentsMdInput): string {
  const parts: string[] = [];

  parts.push(input.identity.trimEnd());
  parts.push(CRITICAL_DIRECTIVE);

  // Position 2.5: inject date-parameterization rules when the archetype uses
  // INPUT_TARGET_DATE. Appears before execution-instructions so the employee
  // reads the date-handling contract before starting any steps.
  if (isDateParameterized(input)) {
    parts.push(DATE_PARAMETERIZATION_RULES);
  }

  parts.push(
    [
      '<execution-instructions>',
      EXEC_IMPORTANT,
      '',
      stripEmbeddedStopDirectives(input.executionSteps).trimEnd(),
      '',
      STOP_DIRECTIVE,
      '</execution-instructions>',
    ].join('\n'),
  );

  parts.push(
    [
      '<delivery-instructions>',
      DELIVERY_IMPORTANT,
      '',
      APPROVED_CONTENT_CONTEXT,
      '',
      input.deliverySteps.trimEnd(),
      '',
      STOP_DIRECTIVE,
      '</delivery-instructions>',
    ].join('\n'),
  );

  // Connected Apps (via Composio) — injected after the shell-tool/delivery
  // instructions and before any employee-specific instructions. Absent when the
  // tenant has no active Composio connections.
  if (input.connectedToolkits && input.connectedToolkits.length > 0) {
    const connectedAppsSection = buildConnectedAppsSection(input.connectedToolkits);
    if (connectedAppsSection) {
      parts.push(connectedAppsSection);
    }
  }

  // Custom Integrations — hand-written shell-tool integrations (Hostfully,
  // Sifely, GitHub, Slack). Injected alongside the Composio section; lists each
  // connected integration and points at its per-service skill. Absent when the
  // tenant has no connected custom integrations.
  if (input.connectedServices && input.connectedServices.length > 0) {
    const customIntegrationsSection = buildCustomIntegrationsSection(input.connectedServices);
    if (customIntegrationsSection) {
      parts.push(customIntegrationsSection);
    }
  }

  if (input.employeeRules?.trim()) {
    parts.push(
      `## Behavioral Rules (Learned)\n\nThese rules override conflicting guidance above.\n\n${input.employeeRules.trimEnd()}`,
    );
  }

  if (input.employeeKnowledge?.trim()) {
    parts.push(`## Knowledge Base\n\n${input.employeeKnowledge.trimEnd()}`);
  }

  const platformRules =
    input.platformRulesOverride != null
      ? input.platformRulesOverride.trimEnd()
      : PLATFORM_RULES_CONTENT;
  parts.push(`## Platform Rules\n\n${platformRules}`);

  return parts.join('\n\n');
}
