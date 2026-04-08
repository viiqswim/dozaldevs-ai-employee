import type { PrismaClient, Project } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { normalizeRepoUrl } from '../../lib/repo-url.js';
import { ProjectRegistryConflictError } from '../../lib/errors.js';

export type CreateProjectInput = {
  name: string;
  repo_url: string;
  jira_project_key: string;
  default_branch?: string;
  concurrency_limit?: number;
  tooling_config?: Record<string, string>;
};

export async function createProject(params: {
  input: CreateProjectInput;
  tenantId: string;
  prisma: PrismaClient;
}): Promise<Project> {
  const { input, tenantId, prisma } = params;

  const normalizedRepoUrl = normalizeRepoUrl(input.repo_url);

  try {
    const project = await prisma.project.create({
      data: {
        name: input.name,
        repo_url: normalizedRepoUrl,
        jira_project_key: input.jira_project_key,
        default_branch: input.default_branch,
        concurrency_limit: input.concurrency_limit,
        tooling_config: input.tooling_config,
        tenant_id: tenantId,
      },
    });

    return project;
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ProjectRegistryConflictError('jira_project_key');
    }
    throw error;
  }
}

export async function listProjects(params: {
  tenantId: string;
  prisma: PrismaClient;
  limit?: number;
  offset?: number;
}): Promise<Project[]> {
  const { tenantId, prisma, limit = 50, offset = 0 } = params;

  const clampedLimit = Math.min(limit, 200);

  return prisma.project.findMany({
    where: {
      tenant_id: tenantId,
    },
    orderBy: {
      created_at: 'desc',
    },
    take: clampedLimit,
    skip: offset,
  });
}

export async function getProjectById(params: {
  id: string;
  tenantId: string;
  prisma: PrismaClient;
}): Promise<Project | null> {
  const { id, tenantId, prisma } = params;

  return prisma.project.findFirst({
    where: {
      id,
      tenant_id: tenantId,
    },
  });
}

export { ProjectRegistryConflictError } from '../../lib/errors.js';
