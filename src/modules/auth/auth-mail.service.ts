import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly transporter?: Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('mail.host');
    const user = config.get<string>('mail.user');
    const password = config.get<string>('mail.password');
    this.from = config.getOrThrow<string>('mail.from');
    this.frontendUrl = config
      .getOrThrow<string>('mail.frontendUrl')
      .replace(/\/$/, '');

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.getOrThrow<number>('mail.port'),
        secure: config.getOrThrow<boolean>('mail.secure'),
        auth: user && password ? { user, pass: password } : undefined,
      });
    }
  }

  sendEmailVerification(email: string, token: string) {
    const url = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return this.send(
      email,
      'Verify your Noltra AI email',
      `Verify your email by opening this link: ${url}\n\nThis link expires soon and can only be used once.`,
    );
  }

  sendPasswordReset(email: string, token: string) {
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.send(
      email,
      'Reset your Noltra AI password',
      `Reset your password by opening this link: ${url}\n\nIf you did not request this, you can ignore this email.`,
    );
  }

  private async send(
    to: string,
    subject: string,
    text: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.debug(`SMTP is not configured; skipped "${subject}" email`);
      return false;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
      return true;
    } catch (error: unknown) {
      this.logger.error(`Failed to send "${subject}" email`, error);
      return false;
    }
  }
}
