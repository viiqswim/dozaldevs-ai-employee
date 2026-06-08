import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { App, ExpressReceiver, SocketModeReceiver } from '@slack/bolt';
import { createLogger } from '../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { createInngestClient } from './inngest/client.js';
import { healthRoutes } from './routes/health.js';
import { jiraRoutes } from './routes/jira.js';
import { hostfullyRoutes } from './routes/hostfully.js';
import { githubRoutes } from './routes/github.js';
import { adminProjectRoutes } from './routes/admin-projects.js';
import { adminEmployeeTriggerRoutes } from './routes/admin-employee-trigger.js';
import { adminTasksRoutes } from './routes/admin-tasks.js';
import { adminTenantsRoutes } from './routes/admin-tenants.js';
import { adminTenantSecretsRoutes } from './routes/admin-tenant-secrets.js';
import { adminTenantConfigRoutes } from './routes/admin-tenant-config.js';
import { adminArchetypesRoutes } from './routes/admin-archetypes.js';
import { adminArchetypeGenerateRoutes } from './routes/admin-archetype-generate.js';
import { adminSlackChannelsRoutes } from './routes/admin-slack-channels.js';
import { callLLM } from '../lib/call-llm.js';
import { adminBrainPreviewRoutes } from './routes/admin-brain-preview.js';
import { adminToolsRoutes } from './routes/admin-tools.js';
import { adminKbRoutes } from './routes/admin-kb.js';
import { adminPropertyLockRoutes } from './routes/admin-property-locks.js';
import { adminRulesRoutes } from './routes/admin-rules.js';
import { adminModelCatalogRoutes } from './routes/admin-model-catalog.js';
import { adminPlatformSettingsRoutes } from './routes/admin-platform-settings.js';
import { slackOAuthRoutes } from './routes/slack-oauth.js';
import { jiraOAuthRoutes } from './routes/jira-oauth.js';
import { notionOAuthRoutes } from './routes/notion-oauth.js';
import { githubOAuthRoutes } from './routes/github-oauth.js';
import { googleOAuthRoutes } from './routes/google-oauth.js';
import { internalGithubTokenRoutes } from './routes/internal-github-token.js';
import { internalGoogleTokenRoutes } from './routes/internal-google-token.js';
import { adminGithubRoutes } from './routes/admin-github.js';
import { adminGoogleRoutes } from './routes/admin-google.js';
import { TenantInstallationStore } from './slack/installation-store.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { TenantSecretRepository } from '../repositories/tenant-secret-repository.js';
import { TenantIntegrationRepository } from './services/tenant-integration-repository.js';
import { inngestServeRoutes } from './inngest/serve.js';
import { registerSlackHandlers } from './slack/handlers.js';
import { createFilteredBoltLogger } from './slack-logger.js';
import { validateEncryptionKey } from '../lib/encryption.js';
import { validateRequiredPlatformSettings } from '../lib/platform-settings.js';
import { requireEnv } from '../lib/config.js';
import { acquireSocketModeLock, releaseSocketModeLock } from './lib/socket-mode-lock.js';

const logger = createLogger('gateway');

function validateProductionEnv(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.OPENCODE_GO_API_KEY) {
    throw new Error(
      'OPENCODE_GO_API_KEY is required in production (set it in Render). ' +
        'It is optional locally and in CI where calls fall back to OpenRouter.',
    );
  }
}

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

  requireEnv('ADMIN_API_KEY');

  if (!process.env.JIRA_WEBHOOK_SECRET) {
    logger.warn(
      'JIRA_WEBHOOK_SECRET is not set — Jira webhook signature verification will be skipped',
    );
  }

  if (!process.env.JIRA_CLIENT_ID) {
    logger.warn('JIRA_CLIENT_ID is not set — Jira OAuth install will return 503');
  }

  if (!process.env.NOTION_CLIENT_ID) {
    logger.warn('NOTION_CLIENT_ID is not set — Notion OAuth install will return 400');
  }

  if (!process.env.GITHUB_APP_NAME) {
    logger.warn('GITHUB_APP_NAME is not set — GitHub App install will return 503');
  }

  const prisma = new PrismaClient();
  const app = express();

  app.use(cors({ origin: true, credentials: true }));

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
          const botToken = installation.bot?.token;
          const botId = installation.bot?.id || undefined;
          return { botToken, botId };
        },
        logger: createFilteredBoltLogger(logger),
      });

      const lockResult = await acquireSocketModeLock();
      if (!lockResult.acquired) {
        logger.warn(
          { holderPid: lockResult.holderPid },
          'Another gateway already holds the Slack Socket Mode lock — refusing to start Socket Mode to avoid stealing events',
        );
        process.exit(1);
      }

      void boltApp
        .start()
        .then(() => {
          logger.info('Slack Bolt — Socket Mode connected');
          const smClient = (boltApp as unknown as { receiver: SocketModeReceiver }).receiver.client;
          smClient.on('disconnected', () => {
            logger.warn('Slack Bolt — Socket Mode disconnected');
          });
          smClient.on('reconnecting', () => {
            logger.info('Slack Bolt — Socket Mode reconnecting');
          });
          smClient.on('connected', () => {
            logger.info('Slack Bolt — Socket Mode reconnected');
          });
          smClient.on('hello', (event: { num_connections?: number }) => {
            const numConnections = event.num_connections ?? 1;
            logger.info(
              { numConnections },
              'Socket Mode hello — num_connections=' + String(numConnections),
            );
            if (numConnections > 1) {
              logger.warn(
                { numConnections },
                'Socket Mode phantom connection warning — num_connections=' +
                  String(numConnections) +
                  '; a prior unclean shutdown may have left a stranded WebSocket. Slack will round-robin events to it. Restart cleanly to recover.',
              );
            }
          });
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Slack Bolt — Socket Mode failed to connect');
        });

      boltApp.error(async (err) => {
        if (err.code === 'slack_bolt_authorization_error') {
          logger.warn(
            { code: err.code },
            'Slack authorization failed — check tenant_secrets table has slack_bot_token for this team',
          );
        } else {
          logger.error({ err, code: err.code }, 'Slack Bolt unhandled error');
        }
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
  app.use(hostfullyRoutes({ inngestClient: options.inngestClient, prisma }));
  app.use(githubRoutes({ prisma }));
  app.use(adminProjectRoutes({ prisma }));
  app.use(adminEmployeeTriggerRoutes({ prisma, inngest: options.inngestClient }));
  app.use(adminTasksRoutes({ prisma }));
  app.use(adminTenantsRoutes({ prisma }));
  app.use(adminTenantSecretsRoutes({ prisma }));
  app.use(adminTenantConfigRoutes({ prisma }));
  app.use(adminArchetypeGenerateRoutes({ callLLM, prisma }));
  app.use(adminArchetypesRoutes({ prisma }));
  app.use(adminSlackChannelsRoutes({ prisma }));
  app.use(adminBrainPreviewRoutes({ prisma }));
  app.use(adminToolsRoutes());
  app.use(adminKbRoutes({ prisma }));
  app.use(adminPropertyLockRoutes({ prisma }));
  app.use(adminRulesRoutes({ prisma }));
  app.use(adminModelCatalogRoutes({ prisma }));
  app.use(adminPlatformSettingsRoutes({ prisma }));
  app.use(slackOAuthRoutes({ prisma }));
  app.use('/integrations', jiraOAuthRoutes({ prisma }));
  app.use('/integrations', notionOAuthRoutes({ prisma }));
  app.use('/integrations', githubOAuthRoutes({ prisma }));
  app.use('/integrations', googleOAuthRoutes({ prisma }));
  app.use('/internal', internalGithubTokenRoutes({ prisma }));
  app.use('/internal', internalGoogleTokenRoutes({ prisma }));
  app.use(adminGithubRoutes({ prisma }));
  app.use(adminGoogleRoutes({ prisma }));
  app.use('/api/inngest', inngestServeRoutes());

  const viteDevProxy = process.env.VITE_DEV_PROXY;
  const dashboardDist = path.resolve(process.cwd(), 'dashboard/dist');
  if (viteDevProxy) {
    app.use(
      createProxyMiddleware({
        target: viteDevProxy,
        changeOrigin: true,
        pathFilter: (path) => path.startsWith('/dashboard'),
        on: {
          error: (_err, _req, res) => {
            logger.warn('Vite proxy error — dev server may still be starting up');
            if (typeof (res as { writeHead?: unknown }).writeHead === 'function') {
              const serverRes = res as import('http').ServerResponse;
              serverRes.writeHead(502, { 'Content-Type': 'application/json' });
              serverRes.end(
                JSON.stringify({ error: 'Dashboard dev server unavailable — is Vite running?' }),
              );
            }
          },
        },
      }),
    );
    logger.info({ viteDevProxy }, 'Dashboard: proxying to Vite dev server (HMR enabled)');
  } else if (fs.existsSync(dashboardDist)) {
    app.use('/dashboard', express.static(dashboardDist));
    app.get('/dashboard', (_req, res) => res.sendFile(path.join(dashboardDist, 'index.html')));
    app.get('/dashboard/*path', (_req, res) =>
      res.sendFile(path.join(dashboardDist, 'index.html')),
    );
  } else {
    logger.warn(
      'dashboard/dist not found — run pnpm dashboard:build or pnpm dev (which sets VITE_DEV_PROXY automatically)',
    );
  }

  // Runtime config endpoint — serves env vars to the dashboard at runtime (avoids baking them at build time)
  app.get('/api/config.js', (_req, res) => {
    res.type('application/javascript');
    const supabaseUrl = process.env.SUPABASE_URL ?? '';
    const config = {
      VITE_POSTGREST_URL: supabaseUrl ? `${supabaseUrl}/rest/v1` : '',
      VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
      VITE_GATEWAY_URL: process.env.GATEWAY_PUBLIC_URL ?? '',
      VITE_INNGEST_URL: 'https://inn.gs',
    };
    res.send(`window.__RUNTIME_CONFIG__ = ${JSON.stringify(config)};`);
  });

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
    .then(async ({ app, boltApp: bolt }) => {
      expressApp = app;
      boltApp = bolt;

      try {
        validateProductionEnv();
        await validateRequiredPlatformSettings();
        logger.info('Platform settings validated');
      } catch (error) {
        logger.error({ err: error }, 'FATAL: Platform settings validation failed');
        process.exit(1);
      }

      const port = parseInt(process.env.PORT ?? '7700', 10);
      const server = app.listen(port, '0.0.0.0', () => {
        logger.info(`Gateway listening on port ${port}`);
      });

      process.on('SIGTERM', () => {
        void (async () => {
          if (bolt) {
            await bolt.stop();
            logger.info(
              { pid: process.pid },
              'Socket Mode WS closed cleanly on shutdown — no phantom expected',
            );
          }
          releaseSocketModeLock();
          server.close(() => process.exit(0));
        })();
      });

      process.on('SIGINT', () => {
        void (async () => {
          if (bolt) {
            await bolt.stop();
            logger.info(
              { pid: process.pid },
              'Socket Mode WS closed cleanly on shutdown — no phantom expected',
            );
          }
          releaseSocketModeLock();
          server.close(() => process.exit(0));
        })();
      });
    })
    .catch((err: unknown) => {
      logger.error(err, 'Failed to start gateway');
      process.exit(1);
    });
}
