import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UpdateRoiConfigurationDto } from './dto/update-roi-configuration.dto';
import { RoiConfigurationView } from './roi-dashboard.types';
import { RoiSettingsRepository } from './roi-settings.repository';

export const DEFAULT_ROI_CONFIGURATION = {
  methodologyVersion: '1.0',
  taskCreationMinutes: 15,
  meetingSchedulingMinutes: 20,
  crmUpdateMinutes: 5,
  emailDraftMinutes: 10,
  hourlyLaborCost: 25,
  currency: 'USD',
} as const;

@Injectable()
export class RoiSettingsService {
  constructor(
    private readonly repository: RoiSettingsRepository,
    private readonly audits: AuditLogsService,
    private readonly organizations: OrganizationsService,
  ) {}

  async get(
    organizationId: string,
    organizationCurrency?: string,
  ): Promise<RoiConfigurationView> {
    const stored = await this.repository.find(organizationId);
    if (!stored) {
      return {
        organizationId,
        ...DEFAULT_ROI_CONFIGURATION,
        currency: this.currency(
          organizationCurrency ||
            (await this.organizations.findCurrent(organizationId))
              .defaultCurrency,
        ),
        source: 'PLATFORM_DEFAULT',
        isEstimated: true,
        updatedAt: null,
      };
    }
    return {
      organizationId,
      methodologyVersion: stored.methodologyVersion,
      taskCreationMinutes: stored.taskCreationMinutes,
      meetingSchedulingMinutes: stored.meetingSchedulingMinutes,
      crmUpdateMinutes: stored.crmUpdateMinutes,
      emailDraftMinutes: stored.emailDraftMinutes,
      hourlyLaborCost: stored.hourlyLaborCost,
      currency: stored.currency,
      source: 'ORGANIZATION_OVERRIDE',
      isEstimated: true,
      updatedAt: stored.updatedAt
        ? new Date(stored.updatedAt).toISOString()
        : null,
    };
  }

  async update(
    organizationId: string,
    userId: string,
    input: UpdateRoiConfigurationDto,
  ) {
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(changes).length) {
      throw new BadRequestException(
        'At least one ROI configuration field is required',
      );
    }
    const organization = await this.organizations.findCurrent(organizationId);
    const effective = await this.get(
      organizationId,
      organization.defaultCurrency,
    );
    const stored = await this.repository.upsert(organizationId, userId, {
      methodologyVersion: effective.methodologyVersion,
      taskCreationMinutes: effective.taskCreationMinutes,
      meetingSchedulingMinutes: effective.meetingSchedulingMinutes,
      crmUpdateMinutes: effective.crmUpdateMinutes,
      emailDraftMinutes: effective.emailDraftMinutes,
      hourlyLaborCost: effective.hourlyLaborCost,
      currency: effective.currency,
      ...changes,
    });
    await this.audits.create({
      organizationId,
      userId,
      action: 'ROI_CONFIGURATION_UPDATED',
      resourceType: 'RoiConfiguration',
      resourceId: String(stored?._id),
      metadata: { fields: Object.keys(changes).sort() },
    });
    return this.get(organizationId, organization.defaultCurrency);
  }

  private currency(value: string | undefined) {
    const normalized = value?.trim().toUpperCase();
    return normalized && /^[A-Z]{3}$/.test(normalized)
      ? normalized
      : DEFAULT_ROI_CONFIGURATION.currency;
  }
}
