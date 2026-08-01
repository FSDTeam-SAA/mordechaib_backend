import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

const logger = new Logger('MailerHelper');

type MailerConfig = {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: Transporter | undefined;
let transporterHost: string | undefined;

function createTransporter(config: MailerConfig): Transporter | undefined {
  if (!config.host || transporterHost === config.host) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user && config.password
        ? { user: config.user, pass: config.password }
        : undefined,
  });
  transporterHost = config.host;
  return transporter;
}

export async function sendEmail(
  configService: ConfigService,
  input: SendEmailInput,
): Promise<boolean> {
  const config: MailerConfig = {
    host: configService.get<string>('mail.host'),
    port: configService.getOrThrow<number>('mail.port'),
    secure: configService.getOrThrow<boolean>('mail.secure'),
    user: configService.get<string>('mail.user'),
    password: configService.get<string>('mail.password'),
    from: configService.getOrThrow<string>('mail.from'),
  };

  createTransporter(config);

  if (!transporter) {
    logger.debug(`SMTP is not configured; skipped "${input.subject}" email`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });
    return true;
  } catch (error: unknown) {
    logger.error(`Failed to send "${input.subject}" email`, error);
    return false;
  }
}
