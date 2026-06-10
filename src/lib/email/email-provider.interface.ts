export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
}

export interface EmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}
