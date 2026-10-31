import { BadRequestException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { RoiSettingsRepository } from './roi-settings.repository';
import {
  DEFAULT_ROI_CONFIGURATION,
  RoiSettingsService,
} from './roi-settings.service';

describe('RoiSettingsService', () => {
  let repository: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let organizations: Record<string, jest.Mock>;
  let service: RoiSettingsService;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      upsert: jest.fn(),
    };
    audits = { create: jest.fn().mockResolvedValue(undefined) };
    organizations = {
      findCurrent: jest.fn().mockResolvedValue({ defaultCurrency: 'BDT' }),
    };
    service = new RoiSettingsService(
      repository as unknown as RoiSettingsRepository,
      audits as unknown as AuditLogsService,
      organizations as unknown as OrganizationsService,
    );
  });

  it('uses transparent platform defaults with the organization currency', async () => {
    repository.find.mockResolvedValue(null);

    await expect(service.get('org-1', 'bdt')).resolves.toEqual({
      organizationId: 'org-1',
      ...DEFAULT_ROI_CONFIGURATION,
      currency: 'BDT',
      source: 'PLATFORM_DEFAULT',
      isEstimated: true,
      updatedAt: null,
    });
  });

  it('persists only supplied overrides and writes an audit record', async () => {
    repository.upsert.mockResolvedValue({ _id: 'config-1' });
    repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce({
      methodologyVersion: '1.0',
      taskCreationMinutes: 18,
      meetingSchedulingMinutes: 20,
      crmUpdateMinutes: 5,
      emailDraftMinutes: 10,
      hourlyLaborCost: 30,
      currency: 'BDT',
      updatedAt: new Date('2026-10-31T00:00:00.000Z'),
    });

    const result = await service.update('org-1', 'user-1', {
      taskCreationMinutes: 18,
      hourlyLaborCost: 30,
    });

    expect(repository.upsert).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        taskCreationMinutes: 18,
        hourlyLaborCost: 30,
        currency: 'BDT',
      }),
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROI_CONFIGURATION_UPDATED' }),
    );
    expect(result.source).toBe('ORGANIZATION_OVERRIDE');
  });

  it('rejects an empty configuration update', async () => {
    await expect(service.update('org-1', 'user-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
