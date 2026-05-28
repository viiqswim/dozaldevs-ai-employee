import { describe, it, expect } from 'vitest';
import { compileAgentsMd } from '../agents-md-compiler.mjs';

const BASE_INPUT = {
  identity: 'You are a test employee.',
  executionSteps: '1. Do the thing.\n2. Submit output.',
  deliverySteps: '1. Post to Slack.\n2. Confirm.',
};

describe('compileAgentsMd', () => {
  it('compiles with all fields — output has all sections in correct order', () => {
    const result = compileAgentsMd({
      ...BASE_INPUT,
      employeeRules: 'Always be polite.',
      employeeKnowledge: 'Property X has a hot tub.',
    });

    const identityPos = result.indexOf('You are a test employee.');
    const criticalPos = result.indexOf('**CRITICAL:');
    const execPos = result.indexOf('<execution-instructions>');
    const deliveryPos = result.indexOf('<delivery-instructions>');
    const rulesPos = result.indexOf('## Behavioral Rules (Learned)');
    const knowledgePos = result.indexOf('## Knowledge Base');
    const platformPos = result.indexOf('## Platform Rules');

    expect(identityPos).toBeGreaterThanOrEqual(0);
    expect(criticalPos).toBeGreaterThan(identityPos);
    expect(execPos).toBeGreaterThan(criticalPos);
    expect(deliveryPos).toBeGreaterThan(execPos);
    expect(rulesPos).toBeGreaterThan(deliveryPos);
    expect(knowledgePos).toBeGreaterThan(rulesPos);
    expect(platformPos).toBeGreaterThan(knowledgePos);
  });

  it('omits Behavioral Rules section when employeeRules is empty string', () => {
    const result = compileAgentsMd({ ...BASE_INPUT, employeeRules: '' });

    expect(result).not.toContain('## Behavioral Rules (Learned)');
    expect(result).toContain('## Platform Rules');
  });

  it('omits Behavioral Rules section when employeeRules is whitespace only', () => {
    const result = compileAgentsMd({ ...BASE_INPUT, employeeRules: '   \n  ' });

    expect(result).not.toContain('## Behavioral Rules (Learned)');
  });

  it('omits Knowledge Base section when employeeKnowledge is undefined', () => {
    const result = compileAgentsMd({ ...BASE_INPUT });

    expect(result).not.toContain('## Knowledge Base');
    expect(result).toContain('## Platform Rules');
  });

  it('omits Knowledge Base section when employeeKnowledge is empty string', () => {
    const result = compileAgentsMd({ ...BASE_INPUT, employeeKnowledge: '' });

    expect(result).not.toContain('## Knowledge Base');
  });

  it('always includes CRITICAL bash directive', () => {
    const result = compileAgentsMd(BASE_INPUT);

    expect(result).toContain(
      '**CRITICAL: You MUST use the bash tool to execute every command in your instructions. Do NOT describe what you would do — EXECUTE it. A text-only response is a failure.**',
    );
  });

  it('always includes XML execution-instructions tag with IMPORTANT and STOP directives', () => {
    const result = compileAgentsMd(BASE_INPUT);

    expect(result).toContain('<execution-instructions>');
    expect(result).toContain('</execution-instructions>');
    expect(result).toContain(
      '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<delivery-instructions>`',
    );
    const execBlock = result.slice(
      result.indexOf('\n<execution-instructions>\n'),
      result.indexOf('</execution-instructions>') + 1,
    );
    expect(execBlock).toContain('**STOP. Do nothing else. Your job is done.**');
  });

  it('always includes XML delivery-instructions tag with IMPORTANT and STOP directives', () => {
    const result = compileAgentsMd(BASE_INPUT);

    expect(result).toContain('<delivery-instructions>');
    expect(result).toContain('</delivery-instructions>');
    expect(result).toContain(
      '**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<execution-instructions>`',
    );
    const deliveryBlock = result.slice(
      result.indexOf('\n<delivery-instructions>\n'),
      result.indexOf('</delivery-instructions>') + 1,
    );
    expect(deliveryBlock).toContain('**STOP. Do nothing else. Your job is done.**');
    expect(deliveryBlock).toContain('**STOP. Do nothing else. Your job is done.**');
  });

  it('always includes Platform Rules section from config file', () => {
    const result = compileAgentsMd(BASE_INPUT);

    expect(result).toContain('## Platform Rules');
    expect(result).toContain('NEVER modify files outside');
    expect(result).toContain('NEVER access the database directly');
  });

  it('includes employeeRules content with override note when provided', () => {
    const result = compileAgentsMd({
      ...BASE_INPUT,
      employeeRules: 'Always greet guests by name.',
    });

    expect(result).toContain('## Behavioral Rules (Learned)');
    expect(result).toContain('These rules override conflicting guidance above.');
    expect(result).toContain('Always greet guests by name.');
  });

  it('includes employeeKnowledge content when provided', () => {
    const result = compileAgentsMd({
      ...BASE_INPUT,
      employeeKnowledge: 'Property A has a pool.',
    });

    expect(result).toContain('## Knowledge Base');
    expect(result).toContain('Property A has a pool.');
  });

  it('execution-instructions and delivery-instructions do not cross-contaminate', () => {
    const result = compileAgentsMd({
      ...BASE_INPUT,
      executionSteps: 'EXEC_ONLY_MARKER',
      deliverySteps: 'DELIVERY_ONLY_MARKER',
    });

    const execOpen = result.indexOf('\n<execution-instructions>\n');
    const execClose = result.indexOf('</execution-instructions>');
    const deliveryOpen = result.indexOf('\n<delivery-instructions>\n');
    const deliveryClose = result.indexOf('</delivery-instructions>');

    const execBlock = result.slice(execOpen, execClose);
    const deliveryBlock = result.slice(deliveryOpen, deliveryClose);

    expect(execBlock).toContain('EXEC_ONLY_MARKER');
    expect(execBlock).not.toContain('DELIVERY_ONLY_MARKER');
    expect(deliveryBlock).toContain('DELIVERY_ONLY_MARKER');
    expect(deliveryBlock).not.toContain('EXEC_ONLY_MARKER');
  });
});
