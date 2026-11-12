import { CallAudioStreamingService } from './call-audio-streaming.service';

describe('CallAudioStreamingService ranges', () => {
  const streaming = new CallAudioStreamingService();
  const resolve = (
    value: string | undefined,
    size: number,
  ): { start: number; end: number } | 'INVALID' | undefined =>
    streaming.resolveByteRange(value, size);

  it('resolves bounded, open-ended, and suffix byte ranges', () => {
    expect(resolve('bytes=0-999', 2_000)).toEqual({ start: 0, end: 999 });
    expect(resolve('bytes=1000-', 2_000)).toEqual({
      start: 1_000,
      end: 1_999,
    });
    expect(resolve('bytes=-500', 2_000)).toEqual({
      start: 1_500,
      end: 1_999,
    });
  });

  it('rejects invalid or unsatisfiable ranges', () => {
    expect(resolve('bytes=2000-', 2_000)).toBe('INVALID');
    expect(resolve('bytes=500-100', 2_000)).toBe('INVALID');
    expect(resolve('bytes=0-1,5-10', 2_000)).toBe('INVALID');
  });
});
