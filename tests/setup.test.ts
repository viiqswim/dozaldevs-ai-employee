import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { getPrisma, cleanupTestData, disconnectPrisma, ADMIN_TEST_KEY } from './setup.js';

describe('setup helpers', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('cleanupTestData', () => {
    it('preserves seed project and deletes others', async () => {
      const prisma = getPrisma();
      const tempProject = await prisma.project.create({
        data: {
          name: 'Temp project',
          repo_url: 'https://github.com/test/temp',
          jira_project_key: 'TMPCLEAN',
          tenant_id: '00000000-0000-0000-0000-000000000001',
        },
      });

      expect(tempProject.id).toBeTruthy();

      await cleanupTestData();

      const projects = await prisma.project.findMany();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe('00000000-0000-0000-0000-000000000003');
    });
  });

  describe('ADMIN_TEST_KEY', () => {
    it('exports a non-empty test key', () => {
      expect(ADMIN_TEST_KEY).toBe('test-admin-key-do-not-use-in-prod');
      expect(ADMIN_TEST_KEY.length).toBeGreaterThan(0);
    });
  });
});
