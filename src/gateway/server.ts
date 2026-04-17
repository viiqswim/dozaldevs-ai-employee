import express from 'express';
import { App, ExpressReceiver } from '@slack/bolt';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { createInngestClient } from './inngest/client.js';
import { healthRoutes } from './routes/health.js';
import { jiraRoutes } from './routes/jira.js';
import { githubRoutes } from './routes/github.js';
import { adminProjectRoutes } from './routes/admin-projects.js';
import { adminEmployeeTriggerRoutes } from './routes/admin-employee-trigger.js';
import { adminTasksRoutes } from './routes/admin-tasks.js';
import { adminTenantsRoutes } from './routes/admin-tenants.js';
import { adminTenantSecretsRoutes } from './routes/admin-tenant-secrets.js';
import { adminTenantConfigRoutes } from './routes/admin-tenant-config.js';
import { slackOAuthRoutes } from './routes/slack-oauth.js';
import { TenantInstallationStore } from './slack/installation-store.js';
import { TenantRepository } from './services/tenant-repository.js';
import { TenantSecretRepository } from './services/tenant-secret-repository.js';
import { TenantIntegrationRepository } from './services/tenant-integration-repository.js';
import { inngestServeRoutes } from './inngest/serve.js';
import { registerSlackHandlers } from './slack/handlers.js';
import { createFilteredBoltLogger } from './slack-logger.js';
import { validateEncryptionKey } from '../lib/encryption.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export type { InngestLike } from './types.js';
import type { InngestLike } from './types.js';

export interface BuildAppOptions {
  inngestClient?: InngestLike;
}

export interface BuildAppResult {
  app: express.Application;
  boltApp: App | undefined;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<BuildAppResult> {
  validateEncryptionKey();

  if (!process.env.ADMIN_API_KEY) {
    throw new Error('Missing required environment variable: ADMIN_API_KEY');
  }

  if (!process.env.JIRA_WEBHOOK_SECRET) {
    logger.warn(
      'JIRA_WEBHOOK_SECRET is not set — Jira webhook signature verification will be skipped',
    );
  }

  const prisma = new PrismaClient();
  const app = express();

  let boltApp: App | undefined;

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (signingSecret && clientId && clientSecret) {
    const installationStore = new TenantInstallationStore(
      new TenantRepository(prisma),
      new TenantSecretRepository(prisma),
      new TenantIntegrationRepository(prisma),
    );

    const appToken = process.env.SLACK_APP_TOKEN;
    if (appToken) {
      boltApp = new App({
        appToken,
        socketMode: true,
        signingSecret,
        authorize: async ({ teamId }) => {
          const installation = await installationStore.fetchInstallation({
            teamId,
            enterpriseId: undefined,
            isEnterpriseInstall: false,
          });
          return { botToken: installation.bot?.token, botId: installation.bot?.id };
        },
        logger: createFilteredBoltLogger(logger),
      });

      void boltApp
        .start()
        .then(() => {
          logger.info('Slack Bolt — Socket Mode connected');
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Slack Bolt — Socket Mode failed to connect');
        });
      logger.info('Slack Bolt initialized — Socket Mode starting');
    } else {
      const receiver = new ExpressReceiver({
        signingSecret,
        clientId,
        clientSecret,
        installationStore,
        endpoints: '/webhooks/slack/interactions',
      });

      boltApp = new App({
        signingSecret,
        receiver,
      });

      app.use(receiver.router);
      logger.info('Slack Bolt initialized — /webhooks/slack/interactions available');
    }

    if (options.inngestClient && boltApp) {
      registerSlackHandlers(boltApp, options.inngestClient);
    }
  } else {
    logger.warn(
      'Slack not configured — SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, and SLACK_CLIENT_SECRET are all required',
    );
  }

  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  app.use(healthRoutes());
  app.use(jiraRoutes({ inngestClient: options.inngestClient, prisma }));
  app.use(githubRoutes());
  app.use(adminProjectRoutes({ prisma }));
  app.use(adminEmployeeTriggerRoutes({ prisma, inngest: options.inngestClient }));
  app.use(adminTasksRoutes({ prisma }));
  app.use(adminTenantsRoutes({ prisma }));
  app.use(adminTenantSecretsRoutes({ prisma }));
  app.use(adminTenantConfigRoutes({ prisma }));
  app.use(slackOAuthRoutes({ prisma }));
  app.use('/api/inngest', inngestServeRoutes());

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return { app, boltApp };
}

export let expressApp: express.Application | undefined;
export let boltApp: App | undefined;

const currentFile = new URL(import.meta.url).pathname;
const calledFile = process.argv[1];
if (calledFile && (currentFile === calledFile || currentFile.endsWith(calledFile))) {
  const inngestClient = createInngestClient();
  buildApp({ inngestClient })
    .then(({ app, boltApp: bolt }) => {
      expressApp = app;
      boltApp = bolt;

      app.listen(3000, '0.0.0.0', () => {
        logger.info('Gateway listening on port 3000');
      });
    })
    .catch((err: unknown) => {
      logger.error(err, 'Failed to start gateway');
      process.exit(1);
    });
}
