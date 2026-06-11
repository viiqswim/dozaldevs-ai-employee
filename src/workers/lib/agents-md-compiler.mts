import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    'node /tools/composio/execute.ts \\',
    '  --toolkit <toolkit-name> \\',
    '  --action <ACTION_NAME> \\',
    "  --params '<json-params>'",
    '```',
    '',
    `Available toolkits: ${list}`,
    'The tool returns JSON. On error it exits non-zero with `{ "error": "..." }`.',
  ].join('\n');
}

const CRITICAL_DIRECTIVE =
  '**CRITICAL: You MUST use the bash tool to execute every command in your instructions. Do NOT describe what you would do — EXECUTE it. A text-only response is a failure.**';

const EXEC_IMPORTANT =
  '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<delivery-instructions>` — that section is for a separate container. STOP after the final step.**';

const DELIVERY_IMPORTANT =
  '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<execution-instructions>` — that section is for a separate container. STOP after the final step.**';

const STOP_DIRECTIVE = '**STOP. Do nothing else. Your job is done.**';

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
