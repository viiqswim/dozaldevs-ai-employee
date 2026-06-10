import { RESEND_API_KEY, EMAIL_FROM, SMTP_URL } from '../config.js';
import { createLogger } from '../logger.js';
import type { EmailProvider } from './email-provider.interface.js';
import { ResendEmailProvider } from './resend-provider.js';
import { SmtpEmailProvider } from './smtp-provider.js';

const logger = createLogger('email');

export function createEmailProvider(): EmailProvider {
  const apiKey = RESEND_API_KEY();
  if (apiKey) {
    logger.info({ provider: 'ResendEmailProvider' }, 'Email provider selected');
    return new ResendEmailProvider(apiKey, EMAIL_FROM());
  }
  logger.info({ provider: 'SmtpEmailProvider' }, 'Email provider selected');
  return new SmtpEmailProvider(SMTP_URL(), EMAIL_FROM());
}

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!_provider) {
    _provider = createEmailProvider();
  }
  return _provider;
}

export type {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface.js';
