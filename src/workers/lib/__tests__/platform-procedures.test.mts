import { describe, it, expect } from 'vitest';
import { generatePlatformProcedures } from '../platform-procedures.mjs';

describe('generatePlatformProcedures', () => {
  describe('approvalRequired: true', () => {
    const output = generatePlatformProcedures({ approvalRequired: true });

    it('contains the section header', () => {
      expect(output).toContain('## How to Complete Your Work');
    });

    it('mentions NEEDS_APPROVAL classification', () => {
      expect(output).toContain('NEEDS_APPROVAL');
    });

    it('includes the submit-output tool command', () => {
      expect(output).toContain('tsx /tools/platform/submit-output.ts');
    });

    it('conveys mandatory and failure consequence', () => {
      expect(output).toContain('mandatory');
      expect(output).toContain('task will be marked Failed');
    });

    it('does NOT contain NO_ACTION_NEEDED as the classification instruction', () => {
      // NEEDS_APPROVAL is default; NO_ACTION_NEEDED may still be mentioned as an alternative
      // but the required final step must be NEEDS_APPROVAL
      expect(output).toContain('--classification "NEEDS_APPROVAL"');
    });
  });

  describe('approvalRequired: false', () => {
    const output = generatePlatformProcedures({ approvalRequired: false });

    it('contains the section header', () => {
      expect(output).toContain('## How to Complete Your Work');
    });

    it('uses NO_ACTION_NEEDED classification', () => {
      expect(output).toContain('NO_ACTION_NEEDED');
    });

    it('instructs NOT to use NEEDS_APPROVAL', () => {
      expect(output).toContain('Do NOT use NEEDS_APPROVAL');
    });

    it('instructs NOT to write approval-message.json', () => {
      expect(output).toContain('Do NOT write /tmp/approval-message.json');
    });

    it('includes the submit-output tool command', () => {
      expect(output).toContain('tsx /tools/platform/submit-output.ts');
    });

    it('has NO_ACTION_NEEDED as the classification in the required final step', () => {
      expect(output).toContain('--classification "NO_ACTION_NEEDED"');
    });
  });

  describe('both variants', () => {
    it('both contain the section header', () => {
      const withApproval = generatePlatformProcedures({ approvalRequired: true });
      const noApproval = generatePlatformProcedures({ approvalRequired: false });
      expect(withApproval).toContain('## How to Complete Your Work');
      expect(noApproval).toContain('## How to Complete Your Work');
    });

    it('both include the mandatory instruction', () => {
      const withApproval = generatePlatformProcedures({ approvalRequired: true });
      const noApproval = generatePlatformProcedures({ approvalRequired: false });
      expect(withApproval).toContain('mandatory');
      expect(noApproval).toContain('mandatory');
    });

    it('both reference the submit-output tool', () => {
      const withApproval = generatePlatformProcedures({ approvalRequired: true });
      const noApproval = generatePlatformProcedures({ approvalRequired: false });
      expect(withApproval).toContain('tsx /tools/platform/submit-output.ts');
      expect(noApproval).toContain('tsx /tools/platform/submit-output.ts');
    });
  });
});
