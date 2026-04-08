import { createLogger } from '../../lib/logger.js';
import { parseRepoOwnerAndName, normalizeRepoUrl } from '../../lib/repo-url.js';
import type { PostgRESTClient } from './postgrest-client.js';
import type { ProjectRow } from './task-context.js';

const log = createLogger('project-config');

export { parseRepoOwnerAndName, normalizeRepoUrl };

/**
 * Project configuration fetched from the database.
 * Extends ProjectRow with all required fields for worker operations.
 */
export interface ProjectConfig extends ProjectRow {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
}

/**
 * Fetch project configuration from the database via PostgREST.
 * Retrieves project metadata including tooling configuration.
 *
 * @param projectId - The project ID to fetch
 * @param postgrestClient - PostgREST client for database access
 * @returns ProjectConfig if found, null on error or empty result
 */
export async function fetchProjectConfig(
  projectId: string,
  postgrestClient: PostgRESTClient,
): Promise<ProjectConfig | null> {
  try {
    const query = `id=eq.${projectId}&select=id,name,repo_url,default_branch,tooling_config`;
    const result = await postgrestClient.get('projects', query);

    // Handle null response or empty array
    if (!result || result.length === 0) {
      return null;
    }

    // Cast first element to ProjectConfig
    return result[0] as ProjectConfig;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.warn(`[project-config] Failed to fetch project ${projectId}: ${errorMsg}`);
    return null;
  }
}
