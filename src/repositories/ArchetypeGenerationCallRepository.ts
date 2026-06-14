/**
 * Archetype-generation-call data-access repository.
 *
 * Uses Prisma; consumed by archetype-generation routes and services to
 * instrument every LLM call made while generating, refining, or estimating an
 * employee archetype. Lives in `src/repositories/` so route/service files stay
 * free of raw DB logic. Worker containers MUST NOT import this module — they
 * use PostgREST.
 *
 * SECURITY: `prompt`/`response` store generation prompts and model output ONLY
 * (employee descriptions, toolkit names, model IDs) — NEVER credentials, tenant
 * secrets, API keys, or tokens. Callers must not pass secret material in.
 *
 * BEST-EFFORT: persistence here is non-blocking instrumentation; callers wrap
 * every call in try/catch and degrade to log.warn so a failed audit insert
 * never breaks the archetype-generation request.
 */
import type { PrismaClient } from '@prisma/client';

const MAX_SIZE = 262144; // 256KB byte cap for stored prompt/response text

export type ArchetypeCallType =
  | 'generate'
  | 'refine'
  | 'recommend_model'
  | 'time_estimate'
  | 'propose_edit';

export type ArchetypeCallStatus = 'success' | 'failed';

export interface RecordInput {
  tenant_id: string;
  archetype_id?: string | null; // nullable — EDGE-1: failures before archetype exists
  call_type: ArchetypeCallType;
  model_requested?: string | null;
  model_actual?: string | null;
  prompt?: string | null;
  response?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  estimated_cost_usd?: number | null;
  latency_ms?: number | null;
  retry_count?: number;
  status: ArchetypeCallStatus;
  error_message?: string | null;
  created_by?: string | null; // nullable — EDGE-3: SERVICE_TOKEN has no user
}

function capText(text: string | null | undefined): { value: string | null; truncated: boolean } {
  if (!text) return { value: text ?? null, truncated: false };
  if (Buffer.byteLength(text, 'utf8') > MAX_SIZE) {
    return { value: text.slice(0, MAX_SIZE), truncated: true };
  }
  return { value: text, truncated: false };
}

export class ArchetypeGenerationCallRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordInput): Promise<{ id: string }> {
    const prompt = capText(input.prompt);
    const response = capText(input.response);

    const row = await this.prisma.archetypeGenerationCall.create({
      data: {
        tenant_id: input.tenant_id,
        archetype_id: input.archetype_id ?? null,
        call_type: input.call_type,
        model_requested: input.model_requested ?? null,
        model_actual: input.model_actual ?? null,
        prompt: prompt.value,
        response: response.value,
        prompt_truncated: prompt.truncated,
        response_truncated: response.truncated,
        prompt_tokens: input.prompt_tokens ?? null,
        completion_tokens: input.completion_tokens ?? null,
        estimated_cost_usd: input.estimated_cost_usd ?? null,
        latency_ms: input.latency_ms ?? null,
        retry_count: input.retry_count ?? 0,
        status: input.status,
        error_message: input.error_message ?? null,
        created_by: input.created_by ?? null,
      },
      select: { id: true },
    });

    return { id: row.id };
  }

  async linkArchetype(callId: string, archetypeId: string): Promise<void> {
    await this.prisma.archetypeGenerationCall.updateMany({
      where: { id: callId, deleted_at: null },
      data: { archetype_id: archetypeId },
    });
  }
}
