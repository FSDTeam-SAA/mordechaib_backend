import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import {
  localCalendarDate,
  localMidnightUtc,
} from '../../common/helpers/local-date-range.helper';
import { CreateRevenueAcquisitionCostDto } from './dto/create-revenue-acquisition-cost.dto';
import { ListRevenueAcquisitionCostsQueryDto } from './dto/list-revenue-acquisition-costs-query.dto';
import { UpdateRevenueAcquisitionCostDto } from './dto/update-revenue-acquisition-cost.dto';
import { RevenueAcquisitionCostRepository } from './revenue-acquisition-cost.repository';
import { parseRevenueAcquisitionCostCsv } from './revenue-acquisition-cost-csv.parser';
import {
  RevenueAcquisitionAnalyticsResponse,
  RevenueAcquisitionCostListResponse,
  RevenueAcquisitionCostResponse,
} from './revenue-acquisition-cost.types';
import {
  RevenueAcquisitionChannel,
  RevenueAnalyticsAvailability,
} from './revenue-analytics.enums';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type CostDocument = {
  _id: unknown;
  period: string;
  channel: RevenueAcquisitionChannel;
  salesCostUsd: number;
  marketingCostUsd: number;
  currency: 'USD';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

type MonthWindow = {
  period: string;
  start: Date;
  end: Date;
  allocation: number;
};

@Injectable()
export class RevenueAcquisitionCostService {
  constructor(
    private readonly repository: RevenueAcquisitionCostRepository,
    private readonly audits: AuditLogsService,
  ) {}

  async create(userId: string, input: CreateRevenueAcquisitionCostDto) {
    if (await this.repository.findDuplicate(input.period, input.channel)) {
      throw new ConflictException(
        'An acquisition cost entry already exists for this period and channel',
      );
    }
    try {
      const result = this.map(await this.repository.create(input, userId));
      await this.audit(
        userId,
        AUDIT_ACTION.REVENUE_ACQUISITION_COST_CREATED,
        result.id,
        { period: result.period, channel: result.channel },
      );
      return result;
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException(
          'An acquisition cost entry already exists for this period and channel',
        );
      }
      throw error;
    }
  }

  async list(
    query: ListRevenueAcquisitionCostsQueryDto,
  ): Promise<RevenueAcquisitionCostListResponse> {
    if (
      query.fromPeriod &&
      query.toPeriod &&
      query.fromPeriod > query.toPeriod
    ) {
      throw new BadRequestException('fromPeriod must not be after toPeriod');
    }
    const result = await this.repository.list(query);
    return {
      items: result.items.map((item) => this.map(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async get(id: string) {
    this.assertId(id);
    const document = await this.repository.findById(id);
    if (!document)
      throw new NotFoundException('Acquisition cost entry not found');
    return this.map(document);
  }

  async update(
    id: string,
    userId: string,
    input: UpdateRevenueAcquisitionCostDto,
  ) {
    this.assertId(id);
    const update = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('At least one update field is required');
    }
    const document = await this.repository.updateById(id, update, userId);
    if (!document)
      throw new NotFoundException('Acquisition cost entry not found');
    const result = this.map(document);
    await this.audit(
      userId,
      AUDIT_ACTION.REVENUE_ACQUISITION_COST_UPDATED,
      id,
      { fields: Object.keys(update) },
    );
    return result;
  }

  async remove(id: string, userId: string) {
    this.assertId(id);
    const document = await this.repository.deleteById(id);
    if (!document)
      throw new NotFoundException('Acquisition cost entry not found');
    const deleted = this.map(document);
    await this.audit(
      userId,
      AUDIT_ACTION.REVENUE_ACQUISITION_COST_DELETED,
      id,
      { period: deleted.period, channel: deleted.channel },
    );
    return { id, deleted: true };
  }

  async import(userId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty CSV file is required');
    }
    const rows = parseRevenueAcquisitionCostCsv(file.buffer);
    const result = await this.repository.import(rows, userId);
    await this.audit(
      userId,
      AUDIT_ACTION.REVENUE_ACQUISITION_COST_IMPORTED,
      undefined,
      result,
    );
    return result;
  }

  async analytics(
    from: Date,
    to: Date,
    timezone: string,
    newlyAcquiredOrganizations: number,
  ): Promise<RevenueAcquisitionAnalyticsResponse> {
    const months = this.monthWindows(from, to, timezone);
    const documents = await this.repository.findPeriods(
      months[0].period,
      months[months.length - 1].period,
    );
    const windows = new Map(months.map((month) => [month.period, month]));
    const covered = new Set<string>();
    const channels = new Map<
      RevenueAcquisitionChannel,
      { salesCostUsd: number; marketingCostUsd: number }
    >();
    for (const document of documents) {
      const window = windows.get(document.period);
      if (!window) continue;
      covered.add(document.period);
      const current = channels.get(document.channel) ?? {
        salesCostUsd: 0,
        marketingCostUsd: 0,
      };
      current.salesCostUsd += document.salesCostUsd * window.allocation;
      current.marketingCostUsd += document.marketingCostUsd * window.allocation;
      channels.set(document.channel, current);
    }
    const breakdown = [...channels.entries()]
      .map(([channel, costs]) => ({
        channel,
        salesCostUsd: this.money(costs.salesCostUsd),
        marketingCostUsd: this.money(costs.marketingCostUsd),
        totalCostUsd: this.money(costs.salesCostUsd + costs.marketingCostUsd),
      }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    const salesCostUsd = this.money(
      breakdown.reduce((sum, row) => sum + row.salesCostUsd, 0),
    );
    const marketingCostUsd = this.money(
      breakdown.reduce((sum, row) => sum + row.marketingCostUsd, 0),
    );
    return {
      salesCostUsd,
      marketingCostUsd,
      totalCostUsd: this.money(salesCostUsd + marketingCostUsd),
      newlyAcquiredOrganizations,
      coveredMonths: covered.size,
      expectedMonths: months.length,
      availability:
        covered.size === 0
          ? RevenueAnalyticsAvailability.UNAVAILABLE
          : covered.size >= months.length
            ? RevenueAnalyticsAvailability.AVAILABLE
            : RevenueAnalyticsAvailability.PARTIAL,
      channels: breakdown,
    };
  }

  private monthWindows(from: Date, to: Date, timezone: string) {
    const windows: MonthWindow[] = [];
    let local = localCalendarDate(from, timezone);
    local = { ...local, day: 1 };
    for (;;) {
      const start = localMidnightUtc(local, timezone);
      const nextLocalDate = new Date(Date.UTC(local.year, local.month, 1));
      const next = {
        year: nextLocalDate.getUTCFullYear(),
        month: nextLocalDate.getUTCMonth() + 1,
        day: 1,
      };
      const end = localMidnightUtc(next, timezone);
      const overlapStart = new Date(Math.max(start.getTime(), from.getTime()));
      const overlapEnd = new Date(Math.min(end.getTime(), to.getTime()));
      if (overlapStart < overlapEnd) {
        windows.push({
          period: `${local.year}-${String(local.month).padStart(2, '0')}`,
          start,
          end,
          allocation:
            (overlapEnd.getTime() - overlapStart.getTime()) /
            (end.getTime() - start.getTime()),
        });
      }
      if (end >= to) break;
      local = next;
    }
    return windows;
  }

  private map(document: unknown): RevenueAcquisitionCostResponse {
    const item = document as CostDocument;
    return {
      id: String(item._id),
      period: item.period,
      channel: item.channel,
      salesCostUsd: this.money(item.salesCostUsd),
      marketingCostUsd: this.money(item.marketingCostUsd),
      totalCostUsd: this.money(item.salesCostUsd + item.marketingCostUsd),
      currency: item.currency,
      ...(item.notes ? { notes: item.notes } : {}),
      createdAt: new Date(item.createdAt).toISOString(),
      updatedAt: new Date(item.updatedAt).toISOString(),
    };
  }

  private assertId(id: string) {
    if (!this.repository.isValidId(id)) {
      throw new BadRequestException('Invalid acquisition cost entry id');
    }
  }

  private isDuplicate(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }

  private audit(
    userId: string,
    action: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.audits.create({
      organizationId: 'PLATFORM',
      userId,
      action,
      resourceType: 'RevenueAcquisitionCost',
      resourceId,
      metadata,
    });
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
