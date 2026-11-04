import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SystemServicesService } from '../system-services/system-services.service';
import { AiStreamingClient } from './ai-streaming.client';

describe('AiStreamingClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses service authentication and leaves the response body unbuffered', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'aiService.baseUrl': 'https://ai.example.test',
          'aiService.automationEnabled': true,
          'aiService.sharedSecret': 'service-secret',
          'aiService.chatStreamTimeoutMs': 300_000,
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    const systemServices = {
      assertAiServiceEnabled: jest.fn().mockResolvedValue(undefined),
    } as unknown as SystemServicesService;
    const upstream = new Response('event: result\ndata: {}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    global.fetch = jest.fn().mockResolvedValue(upstream);
    const client = new AiStreamingClient(config, systemServices);

    const handle = await client.open(
      '/api/v1/ai/chat',
      { message: 'Show the pipeline' },
      new AbortController().signal,
    );

    expect(systemServices.assertAiServiceEnabled).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://ai.example.test/api/v1/ai/chat',
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          'content-type': 'application/json',
          'x-ai-actions-secret': 'service-secret',
        },
        body: JSON.stringify({ message: 'Show the pipeline' }),
      }),
    );
    expect(handle.response).toBe(upstream);
    expect(upstream.bodyUsed).toBe(false);
    handle.abort();
  });

  it('sends the unchanged structured turn and raw files as multipart', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'aiService.baseUrl': 'https://ai.example.test',
          'aiService.automationEnabled': true,
          'aiService.sharedSecret': 'service-secret',
          'aiService.chatStreamTimeoutMs': 300_000,
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    const systemServices = {
      assertAiServiceEnabled: jest.fn().mockResolvedValue(undefined),
    } as unknown as SystemServicesService;
    global.fetch = jest.fn().mockResolvedValue(
      new Response('event: result\ndata: {}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-stream-test-'));
    const localPath = path.join(directory, 'brief.pdf');
    await writeFile(localPath, Buffer.from('%PDF-test'));

    try {
      const client = new AiStreamingClient(config, systemServices);
      await client.open(
        '/api/v1/ai/chat',
        {
          schemaVersion: '1.0',
          message: { id: 'message-1', content: 'Review this' },
          recentMessages: [],
        },
        new AbortController().signal,
        [
          {
            localPath,
            originalName: 'brief.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 9,
          },
        ],
      );

      const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect(init.headers).toEqual({
        accept: 'text/event-stream',
        'x-ai-actions-secret': 'service-secret',
      });
      const form = init.body as FormData;
      expect(form.get('schemaVersion')).toBe('1.0');
      expect(form.get('message')).toBe(
        JSON.stringify({ id: 'message-1', content: 'Review this' }),
      );
      expect(form.get('recentMessages')).toBe('[]');
      const file = form.get('files') as File;
      expect(file.name).toBe('brief.pdf');
      expect(file.type).toBe('application/pdf');
      expect(await file.text()).toBe('%PDF-test');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
