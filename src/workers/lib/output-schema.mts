import { z } from 'zod';

export interface StandardOutput {
  summary: string;
  classification: 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED';
  draft?: string;
  confidence?: number;
  reasoning?: string;
  urgency?: boolean;
  metadata?: Record<string, unknown>;
}

export const standardOutputSchema = z.object({
  summary: z.string(),
  classification: z.enum(['NEEDS_APPROVAL', 'NO_ACTION_NEEDED']),
  draft: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
  urgency: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function parseStandardOutput(raw: string): StandardOutput | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = standardOutputSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

export function isApprovalRequired(output: StandardOutput): boolean {
  return output.classification === 'NEEDS_APPROVAL';
}
