import { BadRequestException } from '@nestjs/common';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';
import { normalizeMeetingUrl, parseMeetingUrl } from './meeting-url.helper';

describe('meeting URL helpers', () => {
  it('accepts and normalizes a Zoom meeting URL without retaining its secret', () => {
    expect(
      normalizeMeetingUrl(
        'https://acme.zoom.us/j/123456789?pwd=secret',
        MeetingPlatform.ZOOM,
      ),
    ).toBe('acme.zoom.us/j/123456789');
  });

  it('accepts standard and lookup Google Meet URLs', () => {
    expect(() =>
      parseMeetingUrl(
        'https://meet.google.com/abc-defg-hij',
        MeetingPlatform.GOOGLE_MEET,
      ),
    ).not.toThrow();
    expect(() =>
      parseMeetingUrl(
        'https://meet.google.com/lookup/customer-success',
        MeetingPlatform.GOOGLE_MEET,
      ),
    ).not.toThrow();
  });

  it('rejects a meeting URL for the wrong platform', () => {
    expect(() =>
      parseMeetingUrl(
        'https://meet.google.com/abc-defg-hij',
        MeetingPlatform.ZOOM,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects deceptive hostnames and non-HTTPS URLs', () => {
    expect(() =>
      parseMeetingUrl(
        'https://meet.google.com.attacker.example/abc-defg-hij',
        MeetingPlatform.GOOGLE_MEET,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      parseMeetingUrl(
        'http://meet.google.com/abc-defg-hij',
        MeetingPlatform.GOOGLE_MEET,
      ),
    ).toThrow(BadRequestException);
  });
});
