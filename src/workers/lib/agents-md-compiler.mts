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
}

const CRITICAL_DIRECTIVE =
  '**CRITICAL: You MUST use the bash tool to execute every command in your instructions. Do NOT describe what you would do — EXECUTE it. A text-only response is a failure.**';

const EXEC_IMPORTANT =
  '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<delivery-instructions>` — that section is for a separate container. STOP after the final step.**';

const DELIVERY_IMPORTANT =
  '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<execution-instructions>` — that section is for a separate container. STOP after the final step.**';

const STOP_DIRECTIVE = '**STOP. Do nothing else. Your job is done.**';

export function compileAgentsMd(input: CompileAgentsMdInput): string {
  const parts: string[] = [];

  parts.push(input.identity.trimEnd());
  parts.push(CRITICAL_DIRECTIVE);

  parts.push(
    [
      '<execution-instructions>',
      EXEC_IMPORTANT,
      '',
      input.executionSteps.trimEnd(),
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

  parts.push(`## Platform Rules\n\n${PLATFORM_RULES_CONTENT}`);

  return parts.join('\n\n');
}
