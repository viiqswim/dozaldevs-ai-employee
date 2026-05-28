import type { callLLM } from '../../lib/call-llm.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('time-estimator');

const FIELDS_TRIGGERING_REESTIMATE = [
  'instructions',
  'execution_instructions',
  'role_name',
  'system_prompt',
  'deliverable_type',
];

const SYSTEM_MESSAGE =
  'You estimate manual task duration. Respond with ONLY a single integer representing the number of minutes a human would need to manually complete this task once. No text, no explanation, just a number.';

export class TimeEstimator {
  constructor(private readonly callLLMFn: typeof callLLM) {}

  async estimate(archetype: {
    role_name: string | null;
    execution_instructions?: string | null;
    instructions?: string | null;
    system_prompt?: string | null;
    deliverable_type: string | null;
  }): Promise<number | null> {
    try {
      const instructionsText = archetype.execution_instructions ?? archetype.instructions ?? null;
      const userMessage = [
        archetype.role_name ? `Role: ${archetype.role_name}` : null,
        archetype.deliverable_type ? `Deliverable type: ${archetype.deliverable_type}` : null,
        instructionsText ? `Instructions: ${instructionsText}` : null,
        archetype.system_prompt ? `System prompt: ${archetype.system_prompt}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await this.callLLMFn({
        model: 'anthropic/claude-haiku-4-5',
        taskType: 'review',
        temperature: 0,
        maxTokens: 50,
        messages: [
          { role: 'system', content: SYSTEM_MESSAGE },
          { role: 'user', content: userMessage },
        ],
      });

      const raw = result.content.trim();

      const directParse = parseInt(raw, 10);
      if (!isNaN(directParse)) {
        return directParse;
      }

      const match = raw.match(/\d+/);
      if (match) {
        return parseInt(match[0], 10);
      }

      log.warn({ raw }, 'TimeEstimator: no integer found in LLM response');
      return null;
    } catch (err) {
      log.warn({ err }, 'TimeEstimator: estimate failed — returning null');
      return null;
    }
  }
}

export function shouldReEstimate(changedFields: string[]): boolean {
  return changedFields.some((field) => FIELDS_TRIGGERING_REESTIMATE.includes(field));
}

export function getEffectiveEstimate(archetype: {
  estimated_manual_minutes: number | null;
  estimated_manual_minutes_override: number | null;
}): number | null {
  if (archetype.estimated_manual_minutes_override !== null) {
    return archetype.estimated_manual_minutes_override;
  }
  if (archetype.estimated_manual_minutes !== null) {
    return archetype.estimated_manual_minutes;
  }
  return null;
}
