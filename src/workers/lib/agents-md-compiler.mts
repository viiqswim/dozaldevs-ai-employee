import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
