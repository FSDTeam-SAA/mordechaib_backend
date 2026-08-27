import { BadRequestException } from '@nestjs/common';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';

const GOOGLE_MEET_PATH =
  /^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[A-Za-z0-9._-]+)\/?$/i;

export function parseMeetingUrl(value: string, platform: MeetingPlatform) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidMeetingUrl(platform);
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw invalidMeetingUrl(platform);
  }

  const hostname = url.hostname.toLowerCase();
  if (platform === MeetingPlatform.ZOOM) {
    const zoomHost = hostname === 'zoom.us' || hostname.endsWith('.zoom.us');
    const zoomPath = /^\/(?:j|my)\/[A-Za-z0-9._-]+\/?$/i.test(url.pathname);
    if (!zoomHost || !zoomPath) throw invalidMeetingUrl(platform);
  } else if (
    hostname !== 'meet.google.com' ||
    !GOOGLE_MEET_PATH.test(url.pathname)
  ) {
    throw invalidMeetingUrl(platform);
  }

  return url;
}

export function normalizeMeetingUrl(value: string, platform: MeetingPlatform) {
  const url = parseMeetingUrl(value, platform);
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
}

function invalidMeetingUrl(platform: MeetingPlatform) {
  const label =
    platform === MeetingPlatform.GOOGLE_MEET ? 'Google Meet' : 'Zoom';
  return new BadRequestException(
    `meetingUrl must be a valid ${label} meeting URL`,
  );
}
