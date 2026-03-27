import type { PrismaClient, Project } from '@prisma/client';

/**
 * Look up a registered project by its Jira project key.
 * Returns null if no project is registered for this key.
 */
export async function lookupProjectByJiraKey(
  jiraProjectKey: string,
  tenantId: string,
  prisma: PrismaClient,
): Promise<Project | null> {
  return prisma.project.findFirst({
    where: {
      jira_project_key: jiraProjectKey,
      tenant_id: tenantId,
    },
  });
}
