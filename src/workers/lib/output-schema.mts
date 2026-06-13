import { z } from 'zod';

export interface StandardOutput {
  // version is optional for backward compatibility with legacy files that pre-date
  // output-contract versioning. Absent = v1. Future-unknown versions are warned but
  // not thrown — additive-only within a major version guarantees degraded read safety.
  version?: number;
  summary: string;
  classification: 'APPROVED' | 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED';
  draft?: string;
  confidence?: number;
  reasoning?: string;
  urgency?: boolean;
  metadata?: Record<string, unknown>;
}

export const standardOutputSchema = z.object({
  version: z.number().int().positive().optional(),
  summary: z.string(),
  classification: z.enum(['APPROVED', 'NEEDS_APPROVAL', 'NO_ACTION_NEEDED']),
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
