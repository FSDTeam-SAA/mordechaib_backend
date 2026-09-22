import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class AiServiceHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class AiServiceClient {
  private readonly logger = new Logger(AiServiceClient.name);

  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return this.config.get<boolean>('aiService.automationEnabled', false);
  }

  async request<T>(
    path: string,
    body: Record<string, unknown>,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    const baseUrl = this.config.get<string>('aiService.baseUrl');
    const secret = this.config.get<string>('aiService.sharedSecret');
    if (!this.enabled || !baseUrl || !secret) {
      this.logger.warn(
        `AI request skipped: automation=${this.enabled}, baseUrlConfigured=${Boolean(baseUrl)}, sharedSecretConfigured=${Boolean(secret)}`,
      );
      throw new ServiceUnavailableException(
        'AI service automation is disabled',
      );
    }

    const requestLabel = this.requestLabel(path, body);
    this.logger.log(`AI request started: ${requestLabel}`);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ai-actions-secret': secret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(
          options.timeoutMs ||
            this.config.get<number>('aiService.timeoutMs', 30_000),
        ),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI service is unavailable';
      this.logger.error(
        `AI request connection failed: ${requestLabel}: ${message}`,
      );
      throw new AiServiceHttpError(message, true);
    }

    const responseBody = await response.text();
    this.logger.log(
      `AI response received: ${requestLabel}, status=${response.status}`,
    );
    if (!response.ok) {
      this.logger.warn(
        `AI request rejected: ${requestLabel}, status=${response.status}`,
      );
      throw new AiServiceHttpError(
        `AI service ${path} failed with ${response.status}: ${responseBody.slice(0, 1000)}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }

    if (!responseBody) return {} as T;
    try {
      return JSON.parse(responseBody) as T;
    } catch {
      this.logger.error(`AI response was not valid JSON: ${requestLabel}`);
      throw new AiServiceHttpError(
        `AI service ${path} returned invalid JSON`,
        false,
      );
    }
  }

  private requestLabel(path: string, body: Record<string, unknown>) {
    const jobId = typeof body.jobId === 'string' ? body.jobId : undefined;
    const requestId =
      typeof body.requestId === 'string' ? body.requestId : undefined;
    const source = body.source as { type?: unknown; id?: unknown } | undefined;
    const sourceLabel =
      source && typeof source.type === 'string' && typeof source.id === 'string'
        ? `, source=${source.type}:${source.id}`
        : '';
    const identifier = jobId || requestId;
    return `POST ${path}${identifier ? `, request=${identifier}` : ''}${sourceLabel}`;
  }
}
