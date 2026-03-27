import { Inngest } from 'inngest';

/**
 * Create the Inngest client for the AI Employee platform.
 * Used for production; tests inject inngestMock instead.
 */
export function createInngestClient(): Inngest {
  return new Inngest({
    id: 'ai-employee',
    isDev: process.env.INNGEST_DEV === '1',
  });
}
