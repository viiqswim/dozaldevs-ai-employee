import { createTransport, type Transporter } from 'nodemailer';

import { createLogger } from '../logger.js';
import type {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface.js';

const logger = createLogger('email');

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly fromAddress: string,
  ) {
    this.transporter = createTransport(smtpUrl);
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      });

      return { id: info.messageId };
    } catch (err) {
      logger.error({ err }, 'Email send failed');
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`SMTP send failed: ${message}`);
    }
  }
}
