import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { SystemServicesService } from '../system-services/system-services.service';
import { AiStreamAttachment } from './ai-stream-attachment';

export type AiStreamHandle = {
  response: Response;
  abort: () => void;
};

@Injectable()
export class AiStreamingClient {
  private readonly logger = new Logger(AiStreamingClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly systemServices: SystemServicesService,
  ) {}

  async open(
    path: string,
    body: Record<string, unknown>,
    clientSignal: AbortSignal,
    attachments: AiStreamAttachment[] = [],
  ): Promise<AiStreamHandle> {
    await this.systemServices.assertAiServiceEnabled();
    const baseUrl = this.config.get<string>('aiService.baseUrl');
    const secret = this.config.get<string>('aiService.sharedSecret');
    const enabled = this.config.get<boolean>(
      'aiService.automationEnabled',
      false,
    );
    if (!enabled || !baseUrl || !secret) {
      this.logger.warn(
        `AI stream skipped: automation=${enabled}, baseUrlConfigured=${Boolean(baseUrl)}, sharedSecretConfigured=${Boolean(secret)}`,
      );
      throw new ServiceUnavailableException(
        'AI service automation is disabled',
      );
    }

    const timeoutSignal = AbortSignal.timeout(
      this.config.get<number>('aiService.chatStreamTimeoutMs', 300_000),
    );
    const upstreamController = new AbortController();
    const signal = AbortSignal.any([
      clientSignal,
      timeoutSignal,
      upstreamController.signal,
    ]);

    this.logger.log(`AI stream request started: POST ${path}`);
    try {
      const request = attachments.length
        ? await this.multipartRequest(body, attachments)
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          };
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          'x-ai-actions-secret': secret,
          ...request.headers,
        },
        body: request.body,
        signal,
      });
      this.logger.log(
        `AI stream response received: POST ${path}, status=${response.status}`,
      );
      return {
        response,
        abort: () => upstreamController.abort(),
      };
    } catch (error) {
      if (clientSignal.aborted || upstreamController.signal.aborted) {
        throw error;
      }
      if (timeoutSignal.aborted) {
        this.logger.warn(`AI stream timed out: POST ${path}`);
        throw new GatewayTimeoutException('AI chat stream timed out');
      }
      const message =
        error instanceof Error ? error.message : 'AI service is unavailable';
      this.logger.error(
        `AI stream connection failed: POST ${path}: ${message}`,
      );
      throw new ServiceUnavailableException('AI service is unavailable');
    }
  }

  private async multipartRequest(
    body: Record<string, unknown>,
    attachments: AiStreamAttachment[],
  ): Promise<{ headers: Record<string, string>; body: FormData }> {
    const form = new FormData();
    for (const [field, value] of Object.entries(body)) {
      if (value === undefined) continue;
      form.append(
        field,
        typeof value === 'string' ? value : JSON.stringify(value),
      );
    }
    for (const attachment of attachments) {
      const bytes = await readFile(attachment.localPath);
      form.append(
        'files',
        new Blob([new Uint8Array(bytes)], { type: attachment.mimeType }),
        attachment.originalName,
      );
    }
    // Fetch must generate the multipart boundary. Setting Content-Type here
    // would produce a malformed request without that boundary.
    return { headers: {}, body: form };
  }
}
