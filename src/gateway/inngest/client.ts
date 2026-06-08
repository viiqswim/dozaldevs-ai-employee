import { Inngest } from 'inngest';
import type { GetStepTools } from 'inngest';

export function createInngestClient(): Inngest {
  return new Inngest({
    id: 'ai-employee',
    isDev: process.env.INNGEST_DEV === '1',
  });
}

export type InngestStep = GetStepTools<Inngest>;
