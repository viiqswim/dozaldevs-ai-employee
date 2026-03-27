import Fastify from 'fastify';
import FastifyRawBody from 'fastify-raw-body';
import { healthRoutes } from './routes/health.js';

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

export async function buildApp(options: BuildAppOptions = {}): Promise<ReturnType<typeof Fastify>> {
  // Validate required env vars
  if (!process.env.JIRA_WEBHOOK_SECRET) {
    throw new Error('Missing required environment variable: JIRA_WEBHOOK_SECRET');
  }

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // Register raw body plugin (needed for HMAC signature verification)
  await app.register(FastifyRawBody, {
    field: 'rawBody',
    global: false, // opt-in per route
    runFirst: true,
    encoding: 'utf8',
  });

  // Register routes
  await app.register(healthRoutes);

  return app;
}

// Start server if this is the main module
const currentFile = new URL(import.meta.url).pathname;
const calledFile = process.argv[1];
if (calledFile && (currentFile === calledFile || currentFile.endsWith(calledFile))) {
  buildApp().then((app) => app.listen({ port: 3000, host: '0.0.0.0' }));
}
