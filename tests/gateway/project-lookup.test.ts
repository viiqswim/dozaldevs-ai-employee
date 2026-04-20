import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { lookupProjectByJiraKey } from '../../src/gateway/services/project-lookup.js';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000002';

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('lookupProjectByJiraKey', () => {
  it('returns the seed project when key matches TEST', async () => {
    const prisma = getPrisma();
    const project = await lookupProjectByJiraKey('TEST', TENANT_ID, prisma);
    expect(project).not.toBeNull();
    expect(project!.name).toBe('test-project');
    expect(project!.jira_project_key).toBe('TEST');
  });

  it('returns null for unknown project key', async () => {
    const prisma = getPrisma();
    const project = await lookupProjectByJiraKey('UNKNOWN', TENANT_ID, prisma);
    expect(project).toBeNull();
  });

  it('returns null for empty string key', async () => {
    const prisma = getPrisma();
    const project = await lookupProjectByJiraKey('', TENANT_ID, prisma);
    expect(project).toBeNull();
  });

  it('returns null when tenant_id does not match', async () => {
    const prisma = getPrisma();
    // The seed project belongs to TENANT_ID — different tenant should not find it
    const differentTenantId = '99999999-9999-9999-9999-999999999999';
    const project = await lookupProjectByJiraKey('TEST', differentTenantId, prisma);
    expect(project).toBeNull();
  });
});
