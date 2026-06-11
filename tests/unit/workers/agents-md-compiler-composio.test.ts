import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/workers/lib/postgrest-client.js', () => ({
  query: queryMock,
}));

import {
  compileAgentsMd,
  loadConnectedToolkits,
} from '../../../src/workers/lib/agents-md-compiler.mjs';

const BASE_INPUT = {
  identity: 'You are a test employee.',
  executionSteps: '1. Do the thing.\n2. Submit output.',
  deliverySteps: '1. Post to Slack.\n2. Confirm.',
};

const TENANT_ID = '00000000-0000-0000-0000-000000000002';

describe('agents-md-compiler — Composio Connected Apps injection', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  describe('loadConnectedToolkits', () => {
    it('returns toolkit names when PostgREST returns active connections', async () => {
      queryMock.mockResolvedValue([{ toolkit: 'notion' }, { toolkit: 'linear' }]);

      const toolkits = await loadConnectedToolkits(TENANT_ID);

      expect(toolkits).toEqual(['notion', 'linear']);
      expect(queryMock).toHaveBeenCalledWith(
        'composio_connections',
        expect.stringContaining(`tenant_id=eq.${TENANT_ID}`),
      );
      const params = queryMock.mock.calls[0][1] as string;
      expect(params).toContain('status=eq.active');
      expect(params).toContain('deleted_at=is.null');
    });

    it('returns empty array when PostgREST returns an empty array', async () => {
      queryMock.mockResolvedValue([]);

      const toolkits = await loadConnectedToolkits(TENANT_ID);

      expect(toolkits).toEqual([]);
    });

    it('returns empty array when PostgREST returns null (query failure)', async () => {
      queryMock.mockResolvedValue(null);

      const toolkits = await loadConnectedToolkits(TENANT_ID);

      expect(toolkits).toEqual([]);
    });

    it('de-duplicates and drops blank toolkit names', async () => {
      queryMock.mockResolvedValue([
        { toolkit: 'notion' },
        { toolkit: 'notion' },
        { toolkit: '' },
        { toolkit: 'linear' },
      ]);

      const toolkits = await loadConnectedToolkits(TENANT_ID);

      expect(toolkits).toEqual(['notion', 'linear']);
    });

    it('returns empty array without querying when tenantId is empty', async () => {
      const toolkits = await loadConnectedToolkits('');

      expect(toolkits).toEqual([]);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  describe('compiled output — section presence based on connection count', () => {
    it('includes Connected Apps section with toolkit names when 1+ connections exist', async () => {
      queryMock.mockResolvedValue([{ toolkit: 'notion' }, { toolkit: 'linear' }]);

      const connectedToolkits = await loadConnectedToolkits(TENANT_ID);
      const result = compileAgentsMd({ ...BASE_INPUT, connectedToolkits });

      expect(result).toContain('## Connected Apps (via Composio)');
      expect(result).toContain('You have access to the following connected apps: notion, linear.');
      expect(result).toContain('Available toolkits: notion, linear');
      expect(result).toContain('node /tools/composio/execute.ts');
      expect(result).toContain('--toolkit <toolkit-name>');
    });

    it('does NOT include Connected Apps section when PostgREST returns empty array', async () => {
      queryMock.mockResolvedValue([]);

      const connectedToolkits = await loadConnectedToolkits(TENANT_ID);
      const result = compileAgentsMd({ ...BASE_INPUT, connectedToolkits });

      expect(result).not.toContain('## Connected Apps (via Composio)');
      expect(result).not.toContain('/tools/composio/execute.ts');
    });
  });

  describe('compileAgentsMd — connectedToolkits param (direct, no DB)', () => {
    it('omits the section when connectedToolkits is undefined (backward compatible)', () => {
      const result = compileAgentsMd({ ...BASE_INPUT });

      expect(result).not.toContain('## Connected Apps (via Composio)');
    });

    it('omits the section when connectedToolkits is an empty array', () => {
      const result = compileAgentsMd({ ...BASE_INPUT, connectedToolkits: [] });

      expect(result).not.toContain('## Connected Apps (via Composio)');
    });

    it('places the section after <delivery-instructions> and before Behavioral Rules', () => {
      const result = compileAgentsMd({
        ...BASE_INPUT,
        connectedToolkits: ['notion'],
        employeeRules: 'Always be polite.',
        employeeKnowledge: 'Property X has a hot tub.',
      });

      const deliveryPos = result.indexOf('</delivery-instructions>');
      const connectedPos = result.indexOf('## Connected Apps (via Composio)');
      const rulesPos = result.indexOf('## Behavioral Rules (Learned)');
      const knowledgePos = result.indexOf('## Knowledge Base');

      expect(deliveryPos).toBeGreaterThanOrEqual(0);
      expect(connectedPos).toBeGreaterThan(deliveryPos);
      expect(rulesPos).toBeGreaterThan(connectedPos);
      expect(knowledgePos).toBeGreaterThan(connectedPos);
    });
  });
});
