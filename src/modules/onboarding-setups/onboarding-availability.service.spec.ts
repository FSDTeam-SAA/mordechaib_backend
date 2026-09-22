import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { OnboardingAvailabilityRepository } from './onboarding-availability.repository';
import { OnboardingAvailabilityService } from './onboarding-availability.service';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';

describe('OnboardingAvailabilityService', () => {
  const availabilityRepository = {
    findDefault: jest.fn(),
    upsertDefault: jest.fn(),
  };
  const setupsRepository = {
    findScheduledMeetingsInRange: jest.fn(),
  };
  const service = new OnboardingAvailabilityService(
    availabilityRepository as unknown as OnboardingAvailabilityRepository,
    setupsRepository as unknown as OnboardingSetupsRepository,
  );
  const admin: RequestUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform',
    role: UserRole.ADMIN,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  const rule = {
    _id: 'availability-1',
    key: 'DEFAULT',
    timezone: 'Asia/Dhaka',
    startDate: '2099-10-01',
    endDate: '2099-10-05',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    dailyStartTime: '09:00',
    dailyEndTime: '22:00',
    meetingDurationMinutes: 90,
    bufferMinutes: 0,
    blockedDates: [],
    isActive: true,
    updatedBy: 'admin-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    availabilityRepository.findDefault.mockResolvedValue(rule);
    setupsRepository.findScheduledMeetingsInRange.mockResolvedValue([]);
  });

  it('dynamically builds 90-minute slots without storing them', async () => {
    const result = await service.getAvailableSlots({ date: '2099-10-01' });

    expect(result.slots).toHaveLength(8);
    expect(result.slots[0]).toEqual({
      startTime: '2099-10-01T03:00:00.000Z',
      endTime: '2099-10-01T04:30:00.000Z',
    });
    expect(result.slots[7]).toEqual({
      startTime: '2099-10-01T13:30:00.000Z',
      endTime: '2099-10-01T15:00:00.000Z',
    });
  });

  it('removes slots that overlap an existing onboarding meeting', async () => {
    setupsRepository.findScheduledMeetingsInRange.mockResolvedValue([
      {
        meeting: {
          status: SetupMeetingStatus.SCHEDULED,
          startTime: new Date('2099-10-01T03:00:00.000Z'),
          endTime: new Date('2099-10-01T04:30:00.000Z'),
        },
      },
    ]);

    const result = await service.getAvailableSlots({ date: '2099-10-01' });

    expect(result.slots).toHaveLength(7);
    expect(result.slots).not.toContainEqual(
      expect.objectContaining({ startTime: '2099-10-01T03:00:00.000Z' }),
    );
  });

  it('supports a recurring schedule without an end date', async () => {
    availabilityRepository.findDefault.mockResolvedValue({
      ...rule,
      endDate: undefined,
    });

    const result = await service.getAvailableSlots({ date: '2100-10-01' });

    expect(result.slots).toHaveLength(8);
  });

  it('accepts only an exact slot returned by the server', async () => {
    await expect(
      service.resolveBookableSlot('2099-10-01T03:00:00.000Z'),
    ).resolves.toEqual({
      start: new Date('2099-10-01T03:00:00.000Z'),
      end: new Date('2099-10-01T04:30:00.000Z'),
      timezone: 'Asia/Dhaka',
    });

    await expect(
      service.resolveBookableSlot('2099-10-01T03:30:00.000Z'),
    ).rejects.toThrow('slot is not available');
  });

  it('stores one availability rule and clears an omitted end date', async () => {
    availabilityRepository.upsertDefault.mockResolvedValue({
      ...rule,
      endDate: undefined,
    });

    await service.upsertAdminAvailability(
      {
        timezone: 'Asia/Dhaka',
        startDate: '2099-10-01',
        weekdays: [1, 2, 3, 4, 5],
        dailyStartTime: '09:00',
        dailyEndTime: '22:00',
        meetingDurationMinutes: 90,
      },
      admin,
    );

    expect(availabilityRepository.upsertDefault).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingDurationMinutes: 90,
        bufferMinutes: 0,
        updatedBy: 'admin-1',
      }),
      true,
    );
  });
});
