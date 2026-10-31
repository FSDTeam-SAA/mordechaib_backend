import { EventEmitter } from 'node:events';
import { Request, Response } from 'express';
import { AiChatStreamingService } from '../ai-integration/ai-chat-streaming.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

class MockRequest extends EventEmitter {
  headers: Record<string, string> = {};
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  chunks: Buffer[] = [];
  jsonBody: unknown;
  writableEnded = false;
  destroyed = false;
  headersSent = false;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  flushHeaders() {
    this.headersSent = true;
  }

  write(value: string | Buffer) {
    this.headersSent = true;
    this.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    return true;
  }

  json(value: unknown) {
    this.headersSent = true;
    this.writableEnded = true;
    this.jsonBody = value;
    return this;
  }

  end() {
    this.headersSent = true;
    this.writableEnded = true;
    return this;
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

describe('MessagesController streaming create', () => {
  const organization = { id: 'org-1' };
  const user = { id: 'user-1' };
  const createdMessage = {
    id: 'message-1',
    conversationId: 'conversation-1',
    content: 'Schedule a meeting',
  };
  let messages: Record<string, jest.Mock>;
  let chatStreaming: Record<string, jest.Mock>;
  let controller: MessagesController;

  beforeEach(() => {
    messages = { create: jest.fn().mockResolvedValue(createdMessage) };
    const upstream = new globalThis.Response(
      'event: result\ndata: {"result":{"type":"MESSAGE"}}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
    const opened = {
      response: upstream,
      abort: jest.fn(),
      settled: false,
    };
    chatStreaming = {
      open: jest.fn().mockResolvedValue(opened),
      reject: jest.fn(),
      cancel: jest.fn(),
      consume: jest.fn(
        async (
          activeStream: { settled: boolean },
          emit: (event: string) => void | Promise<void>,
        ) => {
          await emit('event: activity\ndata: {"stage":"planning"}\n\n');
          await emit('event: result\ndata: {"result":{"type":"MESSAGE"}}\n\n');
          activeStream.settled = true;
          return { terminal: 'result' };
        },
      ),
    };
    controller = new MessagesController(
      messages as unknown as MessagesService,
      chatStreaming as unknown as AiChatStreamingService,
    );
  });

  it('preserves the existing JSON and queue behavior without an SSE accept header', async () => {
    const request = new MockRequest();
    request.headers.accept = 'application/json';
    const response = new MockResponse();

    await controller.create(
      organization,
      user as never,
      { startNewConversation: true, content: 'Hello' },
      undefined,
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(messages.create).toHaveBeenCalledWith(
      organization.id,
      user.id,
      expect.any(Object),
      undefined,
      { enqueueAi: true },
    );
    expect(chatStreaming.open).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(201);
    expect(response.jsonBody).toEqual({
      success: true,
      data: createdMessage,
    });
  });

  it('uses the same route for persisted SSE turns without queueing twice', async () => {
    const request = new MockRequest();
    request.headers.accept = 'text/event-stream';
    const response = new MockResponse();

    await controller.create(
      organization,
      user as never,
      { startNewConversation: true, content: 'Schedule a meeting' },
      undefined,
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(messages.create).toHaveBeenCalledWith(
      organization.id,
      user.id,
      expect.any(Object),
      undefined,
      { enqueueAi: false },
    );
    expect(chatStreaming.open).toHaveBeenCalledWith(
      organization.id,
      createdMessage.id,
      expect.any(AbortSignal),
      [],
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(response.text()).toBe(
      `event: message_created\ndata: ${JSON.stringify({ ...createdMessage, processingStatus: 'PROCESSING' })}\n\n` +
        'event: activity\ndata: {"stage":"planning"}\n\n' +
        'event: result\ndata: {"result":{"type":"MESSAGE"}}\n\n',
    );
    expect(chatStreaming.cancel).not.toHaveBeenCalled();
  });

  it('passes validated multipart attachments to the same AI stream', async () => {
    const request = new MockRequest();
    request.headers.accept = 'text/event-stream';
    const response = new MockResponse();
    const file = {
      path: 'C:\\temp\\brief.pdf',
      originalname: 'brief.pdf',
      mimetype: 'application/pdf',
      size: 9,
    } as Express.Multer.File;

    await controller.create(
      organization,
      user as never,
      { startNewConversation: true, content: 'Review this file' },
      [file],
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(messages.create).toHaveBeenCalledWith(
      organization.id,
      user.id,
      expect.any(Object),
      [file],
      { enqueueAi: false },
    );
    expect(chatStreaming.open).toHaveBeenCalledWith(
      organization.id,
      createdMessage.id,
      expect.any(AbortSignal),
      [
        {
          localPath: file.path,
          originalName: 'brief.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 9,
        },
      ],
    );
  });
});
