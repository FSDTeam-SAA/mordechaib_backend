import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { CallStatus } from '../../common/enums/call-status.enum';
import { CallRecordsService } from '../calls/call-records.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { RecordingStorageService } from './providers/recording-storage.service';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioAccountsService } from './twilio-accounts.service';
import { TwilioEligibilityService } from './twilio-eligibility.service';
import { TwilioSettingsService } from './twilio-settings.service';
import { TwilioTranscriptionService } from './twilio-transcription.service';
import { TwilioUsageService } from './twilio-usage.service';
import { TwilioService } from './twilio.service';
import {
  DEFAULT_AFTER_HOURS_MESSAGE,
  DEFAULT_DIAL_TIMEOUT_SECONDS,
  DEFAULT_UNAVAILABLE_MESSAGE,
} from './twilio.constants';

describe('TwilioService - Inbound Routing & Answering', () => {
  let service: TwilioService;
  let config: Partial<ConfigService>;
  let twilioProvider: Partial<TwilioProvider>;
  let settingsService: Partial<TwilioSettingsService>;
  let callRecordsService: Partial<CallRecordsService>;
  let recordingStorage: Partial<RecordingStorageService>;
  let accountsService: Partial<TwilioAccountsService>;
  let eligibility: Partial<TwilioEligibilityService>;
  let usage: Partial<TwilioUsageService>;
  let transcriptionService: Partial<TwilioTranscriptionService>;
  let organizationsService: Partial<OrganizationsService>;

  beforeEach(() => {
    config = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'APP_BASE_URL') return 'https://api.example.com';
        return fallback;
      }),
    };

    twilioProvider = {
      twiml: () => new twilio.twiml.VoiceResponse(),
    };

    settingsService = {
      findActiveByTwilioNumber: jest.fn(),
      findActiveByOrganization: jest.fn(),
    };

    callRecordsService = {
      recordInboundCall: jest.fn().mockResolvedValue({}),
      recordDialStatus: jest.fn(),
    };

    recordingStorage = {};
    accountsService = {
      contextForOrganization: jest.fn().mockResolvedValue(null),
    };
    eligibility = {};
    usage = {
      recordCompletedCall: jest.fn().mockResolvedValue(undefined),
    };
    transcriptionService = {};
    organizationsService = {
      findCurrent: jest.fn(),
    };

    service = new TwilioService(
      config as ConfigService,
      twilioProvider as TwilioProvider,
      settingsService as TwilioSettingsService,
      callRecordsService as CallRecordsService,
      recordingStorage as RecordingStorageService,
      accountsService as TwilioAccountsService,
      eligibility as TwilioEligibilityService,
      usage as TwilioUsageService,
      transcriptionService as TwilioTranscriptionService,
      organizationsService as OrganizationsService,
    );
  });

  describe('handleIncomingCall', () => {
    it('returns error message if Twilio number is not configured', async () => {
      (settingsService.findActiveByTwilioNumber as jest.Mock).mockResolvedValue(
        null,
      );

      const twiml = await service.handleIncomingCall({
        AccountSid: 'AC123',
        CallSid: 'CA123',
        From: '+15550001',
        To: '+15550002',
      });

      expect(twiml).toContain(
        '<Say>This phone number is not currently configured.</Say>',
      );
      expect(twiml).toContain('<Hangup/>');
    });

    it('plays after-hours message when outside business hours', async () => {
      (settingsService.findActiveByTwilioNumber as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        twilioNumber: '+15550002',
        forwardingNumber: '+8801700000000',
        afterHoursMessage: 'Custom closed message.',
      });

      // Business hours configured as 09:00 - 17:00 UTC
      // We simulate current time as 20:00 UTC (after hours)
      jest.useFakeTimers().setSystemTime(new Date('2026-11-23T20:00:00Z'));

      (organizationsService.findCurrent as jest.Mock).mockResolvedValue({
        _id: 'org-1',
        timezone: 'UTC',
        businessHours: { start: '09:00', end: '17:00' },
      });

      const twiml = await service.handleIncomingCall({
        AccountSid: 'AC123',
        CallSid: 'CA123',
        From: '+15550001',
        To: '+15550002',
      });

      expect(twiml).toContain('Custom closed message.');
      expect(twiml).toContain('<Hangup/>');
      expect(twiml).not.toContain('<Dial');

      expect(callRecordsService.recordInboundCall).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          status: CallStatus.COMPLETED,
        }),
      );

      jest.useRealTimers();
    });

    it('plays default after-hours message if custom message is not set', async () => {
      (settingsService.findActiveByTwilioNumber as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        twilioNumber: '+15550002',
        forwardingNumber: '+8801700000000',
      });

      jest.useFakeTimers().setSystemTime(new Date('2026-11-23T20:00:00Z'));

      (organizationsService.findCurrent as jest.Mock).mockResolvedValue({
        _id: 'org-1',
        timezone: 'UTC',
        businessHours: { start: '09:00', end: '17:00' },
      });

      const twiml = await service.handleIncomingCall({
        AccountSid: 'AC123',
        CallSid: 'CA123',
        From: '+15550001',
        To: '+15550002',
      });

      expect(twiml).toContain(DEFAULT_AFTER_HOURS_MESSAGE);
      expect(twiml).toContain('<Hangup/>');
      expect(twiml).not.toContain('<Dial');

      jest.useRealTimers();
    });

    it('forwards to business owner when within business hours with timeout', async () => {
      (settingsService.findActiveByTwilioNumber as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        twilioNumber: '+15550002',
        forwardingNumber: '+8801700000000',
        isRecordingEnabled: false,
      });

      // 11:00 UTC -> within business hours
      jest.useFakeTimers().setSystemTime(new Date('2026-11-23T11:00:00Z'));

      (organizationsService.findCurrent as jest.Mock).mockResolvedValue({
        _id: 'org-1',
        timezone: 'UTC',
        businessHours: { start: '09:00', end: '17:00' },
      });

      const twiml = await service.handleIncomingCall({
        AccountSid: 'AC123',
        CallSid: 'CA123',
        From: '+15550001',
        To: '+15550002',
      });

      expect(twiml).toContain('<Dial');
      expect(twiml).toContain(`timeout="${DEFAULT_DIAL_TIMEOUT_SECONDS}"`);
      expect(twiml).toContain('+8801700000000');
      expect(twiml).not.toContain(DEFAULT_AFTER_HOURS_MESSAGE);

      jest.useRealTimers();
    });
  });

  describe('handleDialStatusCallback', () => {
    it('plays unavailable message when inbound call is not answered (no-answer)', async () => {
      (callRecordsService.recordDialStatus as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        callSid: 'CA123',
        direction: 'INBOUND',
      });

      (settingsService.findActiveByOrganization as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        unavailableMessage: 'Please call us back tomorrow.',
      });

      const twiml = await service.handleDialStatusCallback('CA123', {
        DialCallStatus: 'no-answer',
      });

      expect(twiml).toContain('Please call us back tomorrow.');
      expect(twiml).toContain('<Hangup/>');
    });

    it('plays default unavailable message when custom unavailableMessage is not set', async () => {
      (callRecordsService.recordDialStatus as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        callSid: 'CA123',
        direction: 'INBOUND',
      });

      (settingsService.findActiveByOrganization as jest.Mock).mockResolvedValue(
        null,
      );

      const twiml = await service.handleDialStatusCallback('CA123', {
        DialCallStatus: 'busy',
      });

      expect(twiml).toContain(DEFAULT_UNAVAILABLE_MESSAGE);
      expect(twiml).toContain('<Hangup/>');
    });

    it('returns empty response when inbound call was completed normally', async () => {
      (callRecordsService.recordDialStatus as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        callSid: 'CA123',
        direction: 'INBOUND',
      });

      const twiml = await service.handleDialStatusCallback('CA123', {
        DialCallStatus: 'completed',
        DialCallDuration: '45',
      });

      expect(twiml).not.toContain('<Say');
      expect(twiml).not.toContain(DEFAULT_UNAVAILABLE_MESSAGE);
    });

    it('does not play unavailable message on outbound calls', async () => {
      (callRecordsService.recordDialStatus as jest.Mock).mockResolvedValue({
        organizationId: 'org-1',
        callSid: 'CA123',
        direction: 'OUTBOUND',
      });

      const twiml = await service.handleDialStatusCallback('CA123', {
        DialCallStatus: 'no-answer',
      });

      expect(twiml).not.toContain('<Say');
      expect(twiml).not.toContain(DEFAULT_UNAVAILABLE_MESSAGE);
    });
  });
});

