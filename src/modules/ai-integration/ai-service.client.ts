import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return this.config.get<boolean>('aiService.automationEnabled', false);
  }

  async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = this.config.get<string>('aiService.baseUrl');
    const secret = this.config.get<string>('aiService.sharedSecret');
    if (!this.enabled || !baseUrl || !secret) {
      throw new ServiceUnavailableException(
        'AI service automation is disabled',
      );
    }

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
          this.config.get<number>('aiService.timeoutMs', 30_000),
        ),
      });
    } catch (error) {
      throw new AiServiceHttpError(
        error instanceof Error ? error.message : 'AI service is unavailable',
        true,
      );
    }

    const responseBody = await response.text();
    if (!response.ok) {
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
      throw new AiServiceHttpError(
        `AI service ${path} returned invalid JSON`,
        false,
      );
    }
  }
}
