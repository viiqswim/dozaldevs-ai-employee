import { describe, it, expect, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../setup.js';

afterAll(async () => {
  await disconnectPrisma();
});

describe('jira_project_key migration', () => {
  it('jira_project_key column exists on projects table', async () => {
    const prisma = getPrisma();
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'jira_project_key'
    `;
    expect(columns).toHaveLength(1);
    expect(columns[0].column_name).toBe('jira_project_key');
  });

  it('seed project has jira_project_key = TEST', async () => {
    const prisma = getPrisma();
    const project = await prisma.project.findUnique({
      where: { id: '00000000-0000-0000-0000-000000000003' },
    });
    expect(project).not.toBeNull();
    expect(project!.jira_project_key).toBe('TEST');
  });

  it('jira_project_key is nullable (insert project without it)', async () => {
    const prisma = getPrisma();
    const project = await prisma.project.create({
      data: {
        name: 'no-key-project',
        repo_url: 'https://github.com/test/no-key',
        default_branch: 'main',
        // jira_project_key intentionally omitted
      },
    });
    expect(project.jira_project_key).toBeNull();
    // Cleanup
    await prisma.project.delete({ where: { id: project.id } });
  });
});
