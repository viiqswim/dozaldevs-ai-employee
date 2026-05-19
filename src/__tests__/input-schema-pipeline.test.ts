import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { InputSchemaItemSchema, InputSchemaSchema } from '../gateway/validation/schemas.js';
import { substituteTemplateVars, buildTemplateVars } from '../workers/lib/template-vars.js';

describe('InputSchemaItemSchema — Zod validation', () => {
  it('accepts a valid text item', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'report_date',
      label: 'Report Date',
      type: 'text',
      frequency: 'every_run',
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid select item with options', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'channel',
      label: 'Slack Channel',
      type: 'select',
      frequency: 'once',
      required: false,
      options: ['#general', '#alerts'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'flag',
      label: 'Flag',
      type: 'checkbox',
      frequency: 'every_run',
      required: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects select type without options', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'choice',
      label: 'Choice',
      type: 'select',
      frequency: 'every_run',
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects select type with empty options array', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'choice',
      label: 'Choice',
      type: 'select',
      frequency: 'every_run',
      required: true,
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects key with spaces', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'report date',
      label: 'Report Date',
      type: 'text',
      frequency: 'every_run',
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects key with uppercase letters', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'ReportDate',
      label: 'Report Date',
      type: 'text',
      frequency: 'every_run',
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts frequency "once"', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'slack_channel',
      label: 'Slack Channel',
      type: 'text',
      frequency: 'once',
      required: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts frequency "every_run"', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'date_range',
      label: 'Date Range',
      type: 'date',
      frequency: 'every_run',
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid frequency value', () => {
    const result = InputSchemaItemSchema.safeParse({
      key: 'report_date',
      label: 'Report Date',
      type: 'text',
      frequency: 'sometimes',
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid types: long_text, date, number, url', () => {
    for (const type of ['long_text', 'date', 'number', 'url'] as const) {
      const result = InputSchemaItemSchema.safeParse({
        key: 'field',
        label: 'Field',
        type,
        frequency: 'every_run',
        required: false,
      });
      expect(result.success, `expected type "${type}" to be valid`).toBe(true);
    }
  });
});

describe('InputSchemaSchema — array validation', () => {
  it('accepts an empty array', () => {
    const result = InputSchemaSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('accepts an array of valid items', () => {
    const result = InputSchemaSchema.safeParse([
      {
        key: 'report_date',
        label: 'Report Date',
        type: 'text',
        frequency: 'every_run',
        required: true,
      },
      {
        key: 'channel',
        label: 'Channel',
        type: 'select',
        frequency: 'once',
        required: false,
        options: ['#dev'],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('fails when one item in the array is invalid', () => {
    const result = InputSchemaSchema.safeParse([
      {
        key: 'report_date',
        label: 'Report Date',
        type: 'text',
        frequency: 'every_run',
        required: true,
      },
      { key: 'bad key', label: 'Bad', type: 'text', frequency: 'every_run', required: false },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('substituteTemplateVars — template substitution', () => {
  it('replaces a single {{var}} with the matching value', () => {
    const vars = { report_date: '2026-05-18' };
    expect(substituteTemplateVars('Today is {{report_date}}.', vars)).toBe('Today is 2026-05-18.');
  });

  it('replaces multiple {{vars}} in the same string', () => {
    const vars = { name: 'Alice', city: 'Paris' };
    expect(substituteTemplateVars('Hello {{name}} from {{city}}!', vars)).toBe(
      'Hello Alice from Paris!',
    );
  });

  it('leaves unresolved {{missing_var}} unchanged', () => {
    const vars = { other: 'value' };
    expect(substituteTemplateVars('Value: {{missing_var}}', vars)).toBe('Value: {{missing_var}}');
  });

  it('replaces with empty string when value is empty', () => {
    const vars = { note: '' };
    expect(substituteTemplateVars('Note: {{note}} end', vars)).toBe('Note:  end');
  });

  it('returns the string unchanged when it contains no {{}} patterns', () => {
    const vars = { x: 'y' };
    expect(substituteTemplateVars('plain text', vars)).toBe('plain text');
  });

  it('does not replace uppercase patterns like {{REPORT_DATE}}', () => {
    const vars = { report_date: '2026-05-18' };
    expect(substituteTemplateVars('{{REPORT_DATE}}', vars)).toBe('{{REPORT_DATE}}');
  });
});

describe('buildTemplateVars — env var mapping', () => {
  it('lowercases all env var keys', () => {
    const env = { MY_VAR: 'hello' };
    const vars = buildTemplateVars(env);
    expect(vars['my_var']).toBe('hello');
  });

  it('strips INPUT_ prefix and lowercases key', () => {
    const env = { INPUT_REPORT_DATE: '2026-05-18' };
    const vars = buildTemplateVars(env);
    expect(vars['report_date']).toBe('2026-05-18');
  });

  it('INPUT_* key takes priority over same key without prefix', () => {
    const env = { report_date: 'raw-value', INPUT_REPORT_DATE: 'input-value' };
    const vars = buildTemplateVars(env);
    expect(vars['report_date']).toBe('input-value');
  });

  it('returns empty object for empty env', () => {
    const vars = buildTemplateVars({});
    expect(vars).toEqual({});
  });

  it('skips undefined values', () => {
    const env: Record<string, string | undefined> = { DEFINED: 'yes', UNDEF: undefined };
    const vars = buildTemplateVars(env);
    expect(vars['defined']).toBe('yes');
    expect('undef' in vars).toBe(false);
  });

  it('correctly maps INPUT_REPORT_DATE to key usable in {{report_date}} substitution', () => {
    const env = { INPUT_REPORT_DATE: '2026-05-18' };
    const vars = buildTemplateVars(env);
    const result = substituteTemplateVars('Date: {{report_date}}', vars);
    expect(result).toBe('Date: 2026-05-18');
  });
});

const TriggerEmployeeBodySchema = z
  .object({ inputs: z.record(z.string(), z.string()).optional() })
  .optional();

describe('trigger body validation — TriggerEmployeeBodySchema', () => {
  it('accepts body with string inputs', () => {
    const result = TriggerEmployeeBodySchema.safeParse({ inputs: { report_date: '2026-05-18' } });
    expect(result.success).toBe(true);
  });

  it('accepts empty body (no inputs required)', () => {
    const result = TriggerEmployeeBodySchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it('accepts body without inputs key', () => {
    const result = TriggerEmployeeBodySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects inputs where a value is a number, not a string', () => {
    const result = TriggerEmployeeBodySchema.safeParse({ inputs: { count: 42 } });
    expect(result.success).toBe(false);
  });
});
