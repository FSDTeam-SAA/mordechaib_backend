import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecallApiError } from './recall.types';

@Injectable()
export class RecallApiClient {
  constructor(private readonly config: ConfigService) {}

  async request<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = 20_000,
  ): Promise<T> {
    const apiKey = this.config.get<string>('recall.apiKey');
    const baseUrl = this.config.get<string>('recall.apiBaseUrl');
    if (!apiKey || !baseUrl) {
      throw new ServiceUnavailableException('Recall.ai is not configured');
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        headers: {
          Authorization: `Token ${apiKey}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new RecallApiError(
        error instanceof Error
          ? `Recall.ai request failed: ${error.message}`
          : 'Recall.ai request failed',
        503,
      );
    }

    const body = await this.parseResponseBody(response);
    if (!response.ok) {
      throw new RecallApiError(
        this.extractErrorMessage(body) ||
          `Recall.ai request failed with HTTP ${response.status}`,
        response.status,
        body,
      );
    }
    return body as T;
  }

  async downloadJson(url: string, label: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new RecallApiError(
        error instanceof Error
          ? `${label} download failed: ${error.message}`
          : `${label} download failed`,
        503,
      );
    }
    if (!response.ok) {
      throw new RecallApiError(
        `${label} download failed with HTTP ${response.status}`,
        response.status,
      );
    }
    return response.json();
  }

  async parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { message: text.slice(0, 1000) };
    }
  }

  private extractErrorMessage(body: unknown): string | undefined {
    if (typeof body === 'string') return body.slice(0, 1000);
    if (Array.isArray(body)) {
      const messages = body
        .map((item) => this.extractErrorMessage(item))
        .filter((item): item is string => Boolean(item));
      return messages.length ? messages.join('; ').slice(0, 1000) : undefined;
    }
    if (!body || typeof body !== 'object') return undefined;

    const record = body as Record<string, unknown>;
    for (const key of [
      'detail',
      'message',
      'error_description',
      'error',
      'non_field_errors',
    ]) {
      const message = this.extractErrorMessage(record[key]);
      if (message) return message;
    }
    return undefined;
  }
}
