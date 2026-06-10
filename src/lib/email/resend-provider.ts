import { Resend } from 'resend';

import { createLogger } from '../logger.js';
import type {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface.js';

const logger = createLogger('email');

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly fromAddress: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? '',
      replyTo: options.replyTo,
    });

    if (result.error) {
      logger.error({ err: result.error }, 'Email send failed');
      throw new Error(`Resend send failed: ${result.error.name}: ${result.error.message}`);
    }

    if (!result.data) {
      logger.error('Email send failed: Resend returned no data');
      throw new Error('Resend send failed: no data returned');
    }

    return { id: result.data.id };
  }
}
