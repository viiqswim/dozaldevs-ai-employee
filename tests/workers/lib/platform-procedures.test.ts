import { describe, expect, it } from 'vitest';
import { generatePlatformProcedures } from '../../../src/workers/lib/platform-procedures.mjs';

describe('generatePlatformProcedures', () => {
  describe('approvalRequired: true', () => {
    it('contains "How to Complete Your Work" heading', () => {
      const result = generatePlatformProcedures({ approvalRequired: true });
      expect(result).toContain('## How to Complete Your Work');
    });

    it('contains NEEDS_APPROVAL classification', () => {
      const result = generatePlatformProcedures({ approvalRequired: true });
      expect(result).toContain('NEEDS_APPROVAL');
    });

    it('does not contain NO_ACTION_NEEDED classification instruction', () => {
      const result = generatePlatformProcedures({ approvalRequired: true });
      expect(result).not.toContain('NEVER requires human approval');
    });

    it('contains submit-output tool invocation', () => {
      const result = generatePlatformProcedures({ approvalRequired: true });
      expect(result).toContain('tsx /tools/platform/submit-output.ts');
    });

    it('contains error handling paragraph', () => {
      const result = generatePlatformProcedures({ approvalRequired: true });
      expect(result).toContain('MUST still call submit-output');
      expect(result).toContain('Never end the session without calling submit-output');
      expect(result).toContain('absence is a hard failure');
    });
  });

  describe('approvalRequired: false', () => {
    it('contains "How to Complete Your Work" heading', () => {
      const result = generatePlatformProcedures({ approvalRequired: false });
      expect(result).toContain('## How to Complete Your Work');
    });

    it('contains NO_ACTION_NEEDED classification', () => {
      const result = generatePlatformProcedures({ approvalRequired: false });
      expect(result).toContain('NO_ACTION_NEEDED');
    });

    it('instructs not to use NEEDS_APPROVAL', () => {
      const result = generatePlatformProcedures({ approvalRequired: false });
      expect(result).toContain('Do NOT use NEEDS_APPROVAL');
    });

    it('contains submit-output tool invocation', () => {
      const result = generatePlatformProcedures({ approvalRequired: false });
      expect(result).toContain('tsx /tools/platform/submit-output.ts');
    });

    it('contains error handling paragraph', () => {
      const result = generatePlatformProcedures({ approvalRequired: false });
      expect(result).toContain('MUST still call submit-output');
      expect(result).toContain('Never end the session without calling submit-output');
      expect(result).toContain('absence is a hard failure');
    });
  });

  it('error handling paragraph appears in both branches', () => {
    const withApproval = generatePlatformProcedures({ approvalRequired: true });
    const withoutApproval = generatePlatformProcedures({ approvalRequired: false });
    const errorText = 'MUST still call submit-output';
    expect(withApproval).toContain(errorText);
    expect(withoutApproval).toContain(errorText);
  });
});
