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
    authorization: string,
    clientSignal: AbortSignal,
    attachments: AiStreamAttachment[] = [],
  ): Promise<AiStreamHandle> {
    await this.systemServices.assertAiServiceEnabled();
    const baseUrl = this.config.get<string>('aiService.baseUrl');
    const sharedSecret = this.config.get<string>('aiService.sharedSecret');
    const enabled = this.config.get<boolean>(
      'aiService.automationEnabled',
      false,
    );
    if (!enabled || !baseUrl || !sharedSecret) {
      this.logger.warn(
        `AI stream skipped: automation=${enabled}, baseUrlConfigured=${Boolean(baseUrl)}, sharedSecretConfigured=${Boolean(sharedSecret)}`,
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
      const response = await fetch(new URL(path, baseUrl).toString(), {
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          Authorization: authorization,
          'x-ai-actions-secret': sharedSecret,
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
  ): Promise<{
    headers: Record<string, string>;
    body: Uint8Array<ArrayBuffer>;
  }> {
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
    // Encode the form ourselves so the request always has a Content-Length:
    // the AI Backend refuses a multipart body of unknown size with 411. The
    // encoder generates the boundary, and its Content-Type carries it.
    const encoded = new Response(form);
    const contentType = encoded.headers.get('content-type');
    if (!contentType?.startsWith('multipart/form-data; boundary=')) {
      throw new Error('Multipart encoding did not produce a boundary');
    }
    return {
      headers: { 'content-type': contentType },
      body: new Uint8Array(await encoded.arrayBuffer()),
    };
  }
}
