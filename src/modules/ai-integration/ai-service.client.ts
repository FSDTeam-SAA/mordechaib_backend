import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemServicesService } from '../system-services/system-services.service';
import { extractAiUsageTelemetry } from '../../common/helpers/ai-usage-telemetry.helper';
import { UsageService } from '../usage/usage.service';

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

  constructor(
    private readonly config: ConfigService,
    private readonly systemServices: SystemServicesService,
    private readonly usage: UsageService,
  ) {}

  get enabled() {
    return this.config.get<boolean>('aiService.automationEnabled', false);
  }

  isEnabled() {
    return this.systemServices.isAiServiceEnabled();
  }

  async request<T>(
    path: string,
    body: Record<string, unknown>,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    await this.systemServices.assertAiServiceEnabled();
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
      const parsed = JSON.parse(responseBody) as T;
      await this.recordUsage(path, body, parsed);
      return parsed;
    } catch {
      this.logger.error(`AI response was not valid JSON: ${requestLabel}`);
      throw new AiServiceHttpError(
        `AI service ${path} returned invalid JSON`,
        false,
      );
    }
  }

  private async recordUsage(
    path: string,
    body: Record<string, unknown>,
    response: unknown,
  ) {
    const organizationId =
      typeof body.organizationId === 'string' ? body.organizationId : undefined;
    const sourceId = this.usageSourceId(path, body);
    if (!organizationId || !sourceId) return;
    try {
      await this.usage.recordAiAction({
        organizationId,
        sourceId,
        path,
        telemetry: extractAiUsageTelemetry(response),
      });
    } catch (error) {
      this.logger.error(
        `AI usage metering failed: path=${path}, organization=${organizationId}, source=${sourceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private usageSourceId(path: string, body: Record<string, unknown>) {
    const id = [
      body.idempotencyKey,
      body.jobId,
      body.requestId,
      body.turnId,
    ].find((value): value is string => typeof value === 'string' && !!value);
    return id ? `${path}:${id}` : undefined;
  }

  private requestLabel(path: string, body: Record<string, unknown>) {
    const jobId = typeof body.jobId === 'string' ? body.jobId : undefined;
    const requestId =
      typeof body.requestId === 'string' ? body.requestId : undefined;
    const turnId = typeof body.turnId === 'string' ? body.turnId : undefined;
    const source = body.source as { type?: unknown; id?: unknown } | undefined;
    const sourceLabel =
      source && typeof source.type === 'string' && typeof source.id === 'string'
        ? `, source=${source.type}:${source.id}`
        : '';
    const identifier = jobId || requestId || turnId;
    return `POST ${path}${identifier ? `, request=${identifier}` : ''}${sourceLabel}`;
  }
}
