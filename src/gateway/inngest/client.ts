import { Inngest } from 'inngest';

export function createInngestClient(): Inngest {
  return new Inngest({
    id: 'ai-employee',
    isDev: process.env.INNGEST_DEV === '1',
  });
}
