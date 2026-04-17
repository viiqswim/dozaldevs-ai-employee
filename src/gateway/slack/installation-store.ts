import type { InstallationStore, Installation, InstallationQuery } from '@slack/bolt';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';

export class TenantInstallationStore implements InstallationStore {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly secretRepo: TenantSecretRepository,
    private readonly integrationRepo: TenantIntegrationRepository,
  ) {}

  async storeInstallation<AuthVersion extends 'v1' | 'v2'>(
    _installation: Installation<AuthVersion, boolean>,
  ): Promise<void> {}

  async fetchInstallation(
    query: InstallationQuery<boolean>,
  ): Promise<Installation<'v1' | 'v2', boolean>> {
    const teamId = query.teamId;
    if (!teamId) {
      throw new Error('No installation for team: teamId is required');
    }
    const integration = await this.integrationRepo.findByExternalId('slack', teamId);
    if (!integration) {
      throw new Error(`No installation for team: ${teamId}`);
    }
    const botToken = await this.secretRepo.get(integration.tenant_id, 'slack_bot_token');
    if (!botToken) {
      throw new Error(`No bot token found for team: ${teamId}`);
    }
    return {
      team: { id: teamId },
      enterprise: undefined,
      user: { token: undefined, scopes: undefined, id: '' },
      bot: {
        token: botToken,
        scopes: [],
        userId: '',
        id: '',
      },
      incomingWebhook: undefined,
      appId: undefined,
      authVersion: 'v2',
      isEnterpriseInstall: false,
      tokenType: 'bot',
    };
  }

  async deleteInstallation(query: InstallationQuery<boolean>): Promise<void> {
    const teamId = query.teamId;
    if (!teamId) return;
    const integration = await this.integrationRepo.findByExternalId('slack', teamId);
    if (!integration) return;
    await this.secretRepo.delete(integration.tenant_id, 'slack_bot_token');
    await this.integrationRepo.delete(integration.tenant_id, 'slack');
    await this.tenantRepo.update(integration.tenant_id, { slack_team_id: null });
  }
}
