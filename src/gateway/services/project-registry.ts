import type { PrismaClient, Project } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { normalizeRepoUrl } from '../../lib/repo-url.js';
import { ProjectRegistryConflictError } from '../../lib/errors.js';
import type { UpdateProjectInput } from '../validation/schemas.js';

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

export async function updateProject(params: {
  id: string;
  input: UpdateProjectInput;
  tenantId: string;
  prisma: PrismaClient;
}): Promise<Project | null> {
  const { id, input, tenantId, prisma } = params;

  // Check if project exists and belongs to this tenant
  const existing = await prisma.project.findFirst({
    where: {
      id,
      tenant_id: tenantId,
    },
  });

  if (!existing) return null;

  // Build update data from provided fields only
  const updateData: Record<string, unknown> = {};

  if (input.name !== undefined) {
    updateData.name = input.name;
  }

  if (input.repo_url !== undefined) {
    updateData.repo_url = normalizeRepoUrl(input.repo_url);
  }

  if (input.jira_project_key !== undefined) {
    updateData.jira_project_key = input.jira_project_key;
  }

  if (input.default_branch !== undefined) {
    updateData.default_branch = input.default_branch;
  }

  if (input.concurrency_limit !== undefined) {
    updateData.concurrency_limit = input.concurrency_limit;
  }

  if (input.tooling_config !== undefined) {
    // tooling_config uses replacement semantics — the entire JSON is replaced, not merged
    updateData.tooling_config = input.tooling_config;
  }

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
    });

    return updated;
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ProjectRegistryConflictError('jira_project_key');
    }
    throw error;
  }
}

export { ProjectRegistryConflictError } from '../../lib/errors.js';
