import { SseEventParser } from './sse-event.parser';

describe('SseEventParser', () => {
  it('preserves fragmented events and keep-alive comments', () => {
    const parser = new SseEventParser();

    expect(parser.push('event: activ')).toEqual([]);
    expect(
      parser.push(
        'ity\r\ndata: {"stage":"planning"}\r\n\r\n: ping\n\nevent: result\n',
      ),
    ).toEqual([
      {
        event: 'activity',
        data: '{"stage":"planning"}',
        raw: 'event: activity\ndata: {"stage":"planning"}\n\n',
      },
      { event: 'message', raw: ': ping\n\n' },
    ]);
    expect(parser.push('data: {"summary":"done"}\n\n')).toEqual([
      {
        event: 'result',
        data: '{"summary":"done"}',
        raw: 'event: result\ndata: {"summary":"done"}\n\n',
      },
    ]);
    expect(parser.finish()).toEqual([]);
  });

  it('joins multiple data lines using SSE semantics', () => {
    const parser = new SseEventParser();

    expect(parser.push('event: result\ndata: {\ndata: }\n\n')).toEqual([
      {
        event: 'result',
        data: '{\n}',
        raw: 'event: result\ndata: {\ndata: }\n\n',
      },
    ]);
  });
});
