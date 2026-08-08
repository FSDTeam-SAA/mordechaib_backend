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
let transporterKey: string | undefined;

function createTransporter(config: MailerConfig): Transporter | undefined {
  if (!config.host) {
    transporter = undefined;
    transporterKey = undefined;
    return transporter;
  }

  const transporterConfigKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    hasPassword: Boolean(config.password),
  });
  if (transporter && transporterKey === transporterConfigKey) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user && config.password !== undefined
        ? { user: config.user, pass: config.password }
        : undefined,
  });
  transporterKey = transporterConfigKey;
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

  const currentTransporter = createTransporter(config);

  if (!currentTransporter) {
    logger.warn(
      `SMTP is not configured; unable to send "${input.subject}" email. ` +
        'Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM.',
    );
    return false;
  }

  try {
    await currentTransporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send "${input.subject}" email: ${message}`);
    return false;
  }
}
