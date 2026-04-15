import express from 'express';
import { App, ExpressReceiver } from '@slack/bolt';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { createInngestClient } from './inngest/client.js';
import { healthRoutes } from './routes/health.js';
import { jiraRoutes } from './routes/jira.js';
import { githubRoutes } from './routes/github.js';
import { adminProjectRoutes } from './routes/admin-projects.js';
import { inngestServeRoutes } from './inngest/serve.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface InngestLike {
  send(event: {
    name: string;
    data: Record<string, unknown>;
    id?: string;
  }): Promise<{ ids: string[] }>;
}

export interface BuildAppOptions {
  inngestClient?: InngestLike;
}

export interface BuildAppResult {
  app: express.Application;
  boltApp: App | undefined;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<BuildAppResult> {
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

  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  let boltApp: App | undefined;

  if (process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN) {
    const receiver = new ExpressReceiver({
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      endpoints: '/webhooks/slack/interactions',
    });

    boltApp = new App({
      token: process.env.SLACK_BOT_TOKEN,
      receiver,
    });

    app.use(receiver.router);

    logger.info('Slack Bolt initialized — /webhooks/slack/interactions available');
  } else {
    logger.warn('Slack not configured — /webhooks/slack/interactions unavailable');
  }

  app.use(healthRoutes());
  app.use(jiraRoutes({ inngestClient: options.inngestClient, prisma }));
  app.use(githubRoutes());
  app.use(adminProjectRoutes({ prisma }));
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
