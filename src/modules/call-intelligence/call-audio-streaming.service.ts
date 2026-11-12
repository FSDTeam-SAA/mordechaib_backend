import { BadGatewayException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CallAudioResult } from './call-intelligence.service';

@Injectable()
export class CallAudioStreamingService {
  async stream(
    audio: CallAudioResult,
    rangeHeader: string | undefined,
    response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');

    if ('downloadUrl' in audio) {
      await this.streamRemote(audio, rangeHeader, response);
      return;
    }

    const range = this.resolveByteRange(rangeHeader, audio.size);
    if (range === 'INVALID') {
      response.status(416);
      response.setHeader('Content-Range', `bytes */${audio.size}`);
      response.setHeader('Accept-Ranges', 'bytes');
      response.end();
      return;
    }
    const contentLength = range ? range.end - range.start + 1 : audio.size;
    this.setAudioHeaders(
      response,
      audio.contentType,
      audio.filename,
      contentLength.toString(),
    );
    response.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${audio.size}`,
      );
    }
    await pipeline(
      createReadStream(audio.filePath, range || undefined),
      response,
    );
  }

  resolveByteRange(
    value: string | undefined,
    size: number,
  ): { start: number; end: number } | 'INVALID' | undefined {
    if (!value) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) return 'INVALID';

    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        return 'INVALID';
      }
      return {
        start: Math.max(0, size - suffixLength),
        end: size - 1,
      };
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(requestedEnd) ||
      start < 0 ||
      start >= size ||
      requestedEnd < start
    ) {
      return 'INVALID';
    }
    return { start, end: Math.min(requestedEnd, size - 1) };
  }

  private async streamRemote(
    audio: Extract<CallAudioResult, { downloadUrl: string }>,
    rangeHeader: string | undefined,
    response: Response,
  ) {
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(audio.downloadUrl, {
        headers: rangeHeader ? { Range: rangeHeader } : undefined,
      });
    } catch {
      throw new BadGatewayException('Call audio storage is unavailable');
    }
    if (upstream.status === 416) {
      response.status(416);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) response.setHeader('Content-Range', contentRange);
      response.end();
      return;
    }
    if (!upstream.ok || !upstream.body) {
      throw new BadGatewayException('Call audio could not be downloaded');
    }
    this.setAudioHeaders(
      response,
      upstream.headers.get('content-type') || audio.contentType,
      audio.filename,
      upstream.headers.get('content-length'),
    );
    response.setHeader('Accept-Ranges', 'bytes');
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) response.setHeader('Content-Range', contentRange);
    response.status(upstream.status === 206 ? 206 : 200);
    await pipeline(Readable.fromWeb(upstream.body as never), response);
  }

  private setAudioHeaders(
    response: Response,
    contentType: string,
    filename: string,
    contentLength: string | null,
  ) {
    response.setHeader('Content-Type', contentType);
    if (contentLength) response.setHeader('Content-Length', contentLength);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    );
  }
}
