export type ParsedSseEvent = {
  event: string;
  data?: string;
  raw: string;
};

export class SseEventParser {
  private buffer = '';

  push(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk;
    const events: ParsedSseEvent[] = [];
    for (;;) {
      const boundary = this.boundary();
      if (!boundary) break;
      const block = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary.length);
      events.push(this.parse(block));
    }
    return events;
  }

  finish(): ParsedSseEvent[] {
    if (!this.buffer.trim()) {
      this.buffer = '';
      return [];
    }
    const block = this.buffer;
    this.buffer = '';
    return [this.parse(block)];
  }

  private boundary() {
    const lf = this.buffer.indexOf('\n\n');
    const crlf = this.buffer.indexOf('\r\n\r\n');
    if (lf < 0 && crlf < 0) return undefined;
    if (crlf >= 0 && (lf < 0 || crlf < lf)) {
      return { index: crlf, length: 4 };
    }
    return { index: lf, length: 2 };
  }

  private parse(block: string): ParsedSseEvent {
    const normalized = block.replace(/\r\n/g, '\n');
    let event = 'message';
    const data: string[] = [];
    for (const line of normalized.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim() || 'message';
      } else if (line.startsWith('data:')) {
        data.push(line.slice('data:'.length).replace(/^ /, ''));
      }
    }
    return {
      event,
      ...(data.length ? { data: data.join('\n') } : {}),
      raw: `${normalized}\n\n`,
    };
  }
}
