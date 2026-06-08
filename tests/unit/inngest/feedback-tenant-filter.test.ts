import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('feedback queries — tenant_id filter', () => {
  it('lifecycle execute step employee_rules query includes archetype_id=eq.${archetypeId} filter', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/inngest/lifecycle/steps/execute.ts'),
      'utf-8',
    );
    expect(src).toContain('archetype_id=eq.${archetypeId}');
    expect(src).toContain("'employee_rules'");
  });

  it('rule-synthesizer.ts employee_rules query includes tenant_id=eq.${tenantId} filter', () => {
    const src = readFileSync(join(process.cwd(), 'src/inngest/rule-synthesizer.ts'), 'utf-8');
    expect(src).toContain('tenant_id=eq.${tenantId}');
    expect(src).toContain('/rest/v1/employee_rules');
  });

  it('rule-synthesizer.ts does not contain TODO(GM-19) comment', () => {
    const src = readFileSync(join(process.cwd(), 'src/inngest/rule-synthesizer.ts'), 'utf-8');
    expect(src).not.toContain('TODO(GM-19)');
  });
});
