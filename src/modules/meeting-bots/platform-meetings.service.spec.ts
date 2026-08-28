import { ConfigService } from '@nestjs/config';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { GoogleMeetAuthService } from './google-meet-auth.service';
import { MeetingBotsService } from './meeting-bots.service';
import { PlatformMeetingsRepository } from './platform-meetings.repository';
import { PlatformMeetingsService } from './platform-meetings.service';
import { GoogleMeetProvider } from './providers/google-meet.provider';
import { RecallZoomAuthProvider } from './providers/recall-zoom-auth.provider';
import { ZoomAuthService } from './zoom-auth.service';

describe('PlatformMeetingsService', () => {
  const meetingId = '66cc9bdfa847ea856c7b41d2';
  let stored: Record<string, unknown>;
  let repository: Record<string, jest.Mock>;
  let meetingBots: Record<string, jest.Mock>;
  let googleAuth: Record<string, jest.Mock>;
  let googleProvider: Record<string, jest.Mock>;
  let service: PlatformMeetingsService;

  beforeEach(() => {
    stored = {
      _id: meetingId,
      platform: MeetingPlatform.GOOGLE_MEET,
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      title: 'Project review',
      startsAt: new Date('2099-09-01T10:00:00.000Z'),
      endsAt: new Date('2099-09-01T10:30:00.000Z'),
      durationMinutes: 30,
      timezone: 'Asia/Dhaka',
      invitees: [],
      status: PlatformMeetingStatus.CREATING,
      botRequested: true,
    };
    repository = {
      reserve: jest.fn().mockImplementation(async (input) => {
        stored = { ...stored, ...input };
        return { meeting: stored, created: true };
      }),
      update: jest.fn().mockImplementation(async (_id, _org, input) => {
        stored = { ...stored, ...input };
        return stored;
      }),
      findInternalById: jest.fn(),
      list: jest.fn(),
    };
    meetingBots = {
      create: jest.fn().mockResolvedValue({ _id: 'meeting-bot-1' }),
      cancel: jest.fn(),
    };
    googleAuth = {
      getAccessToken: jest.fn().mockResolvedValue('google-token'),
    };
    googleProvider = {
      createMeeting: jest.fn().mockResolvedValue({
        providerMeetingId: 'event-1',
        joinUrl: 'https://meet.google.com/abc-defg-hij',
        startUrl: 'https://meet.google.com/abc-defg-hij',
      }),
      deleteMeeting: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'meetingPlatforms.defaultTimezone': 'Asia/Dhaka',
          'meetingPlatforms.defaultDurationMinutes': 30,
        };
        return values[key] ?? fallback;
      }),
      getOrThrow: jest.fn().mockReturnValue('e'.repeat(32)),
    };
    service = new PlatformMeetingsService(
      repository as unknown as PlatformMeetingsRepository,
      meetingBots as unknown as MeetingBotsService,
      {} as ZoomAuthService,
      googleAuth as unknown as GoogleMeetAuthService,
      {} as RecallZoomAuthProvider,
      googleProvider as unknown as GoogleMeetProvider,
      config as unknown as ConfigService,
    );
  });

  it('creates a Google Meet and queues a linked Recall bot', async () => {
    const result = await service.create('org-1', 'user-1', {
      platform: MeetingPlatform.GOOGLE_MEET,
      title: 'Project review',
      startsAt: '2099-09-01T10:00:00.000Z',
      idempotencyKey: 'request-1',
    });

    expect(googleAuth.getAccessToken).toHaveBeenCalledWith('org-1');
    expect(googleProvider.createMeeting).toHaveBeenCalledWith(
      'google-token',
      expect.objectContaining({ title: 'Project review', immediate: false }),
    );
    expect(meetingBots.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      MeetingPlatform.GOOGLE_MEET,
      expect.objectContaining({
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: meetingId,
        status: PlatformMeetingStatus.SCHEDULED,
        meetingBotId: 'meeting-bot-1',
        joinUrl: 'https://meet.google.com/abc-defg-hij',
        duplicate: false,
      }),
    );
  });

  it('returns a usable meeting with a warning when bot queueing fails', async () => {
    meetingBots.create.mockRejectedValue(new Error('Redis is unavailable'));

    const result = await service.create('org-1', 'user-1', {
      platform: MeetingPlatform.GOOGLE_MEET,
      title: 'Project review',
      sendBot: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: PlatformMeetingStatus.READY,
        joinUrl: 'https://meet.google.com/abc-defg-hij',
        failureCode: 'BOT_PROVISIONING_FAILED',
        warning: expect.stringContaining('Recall bot'),
      }),
    );
  });

  it('hides host URLs and management from unrelated organization members', async () => {
    await service.create('org-1', 'user-1', {
      platform: MeetingPlatform.GOOGLE_MEET,
      title: 'Project review',
      sendBot: false,
    });
    repository.findInternalById.mockImplementation(async () => stored);
    const otherMember = { id: 'user-2', role: UserRole.MEMBER };

    const meeting = await service.get('org-1', otherMember, meetingId);

    expect(meeting.joinUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(meeting.startUrl).toBeUndefined();
    await expect(
      service.provisionBot('org-1', otherMember, meetingId),
    ).rejects.toThrow('Only the meeting creator');
  });
});
