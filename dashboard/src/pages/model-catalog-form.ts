import type { ModelCatalogEntry } from '@/lib/types';

export interface ModelForm {
  model_id: string;
  display_name: string;
  provider: string;
  description: string;
  context_window: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
  is_free: boolean;
  throughput_tokens_per_sec: string;
  latency_seconds: string;
  quality_index: string;
  agentic_score: string;
  tool_use_score: string;
  instruction_following_score: string;
  non_hallucination_rate: string;
  tool_call_error_rate: string;
  structured_output_error_rate: string;
  supports_tools: boolean;
  supports_structured_output: boolean;
  is_active: boolean;
  notes: string;
  strengths: string;
  weaknesses: string;
}

export const EMPTY_FORM: ModelForm = {
  model_id: '',
  display_name: '',
  provider: '',
  description: '',
  context_window: '128000',
  input_cost_per_million: '0',
  output_cost_per_million: '0',
  is_free: false,
  throughput_tokens_per_sec: '',
  latency_seconds: '',
  quality_index: '',
  agentic_score: '',
  tool_use_score: '',
  instruction_following_score: '',
  non_hallucination_rate: '',
  tool_call_error_rate: '',
  structured_output_error_rate: '',
  supports_tools: true,
  supports_structured_output: true,
  is_active: true,
  notes: '',
  strengths: '',
  weaknesses: '',
};

export function entryToForm(entry: ModelCatalogEntry): ModelForm {
  return {
    model_id: entry.model_id,
    display_name: entry.display_name,
    provider: entry.provider,
    description: entry.description ?? '',
    context_window: String(entry.context_window),
    input_cost_per_million: String(entry.input_cost_per_million),
    output_cost_per_million: String(entry.output_cost_per_million),
    is_free: entry.is_free,
    throughput_tokens_per_sec:
      entry.throughput_tokens_per_sec !== null ? String(entry.throughput_tokens_per_sec) : '',
    latency_seconds: entry.latency_seconds !== null ? String(entry.latency_seconds) : '',
    quality_index: entry.quality_index !== null ? String(entry.quality_index) : '',
    agentic_score: entry.agentic_score !== null ? String(entry.agentic_score) : '',
    tool_use_score: entry.tool_use_score !== null ? String(entry.tool_use_score) : '',
    instruction_following_score:
      entry.instruction_following_score !== null ? String(entry.instruction_following_score) : '',
    non_hallucination_rate:
      entry.non_hallucination_rate !== null ? String(entry.non_hallucination_rate) : '',
    tool_call_error_rate:
      entry.tool_call_error_rate !== null ? String(entry.tool_call_error_rate) : '',
    structured_output_error_rate:
      entry.structured_output_error_rate !== null ? String(entry.structured_output_error_rate) : '',
    supports_tools: entry.supports_tools,
    supports_structured_output: entry.supports_structured_output,
    is_active: entry.is_active,
    notes: entry.notes ?? '',
    strengths: entry.strengths ?? '',
    weaknesses: entry.weaknesses ?? '',
  };
}

export function parseOptionalFloat(val: string): number | null {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

export function formToPayload(
  form: ModelForm,
): Omit<ModelCatalogEntry, 'id' | 'created_at' | 'updated_at' | 'supported_gateways'> {
  return {
    model_id: form.model_id.trim(),
    display_name: form.display_name.trim(),
    provider: form.provider.trim(),
    description: form.description.trim() || null,
    context_window: parseInt(form.context_window, 10) || 0,
    input_cost_per_million: parseFloat(form.input_cost_per_million) || 0,
    output_cost_per_million: parseFloat(form.output_cost_per_million) || 0,
    is_free: form.is_free,
    throughput_tokens_per_sec: parseOptionalFloat(form.throughput_tokens_per_sec),
    latency_seconds: parseOptionalFloat(form.latency_seconds),
    quality_index: parseOptionalFloat(form.quality_index),
    agentic_score: parseOptionalFloat(form.agentic_score),
    tool_use_score: parseOptionalFloat(form.tool_use_score),
    instruction_following_score: parseOptionalFloat(form.instruction_following_score),
    non_hallucination_rate: parseOptionalFloat(form.non_hallucination_rate),
    tool_call_error_rate: parseOptionalFloat(form.tool_call_error_rate),
    structured_output_error_rate: parseOptionalFloat(form.structured_output_error_rate),
    supports_tools: form.supports_tools,
    supports_structured_output: form.supports_structured_output,
    is_active: form.is_active,
    notes: form.notes.trim() || null,
    strengths: form.strengths.trim() || null,
    weaknesses: form.weaknesses.trim() || null,
  };
}
