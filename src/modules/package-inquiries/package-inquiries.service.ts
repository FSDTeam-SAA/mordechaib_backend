import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackageType } from '../../common/enums/package-type.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { ContactUserSalesQueryDto } from './dto/contact-user-sales-query.dto';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';
import { ListSalesQueriesDto } from './dto/list-sales-queries.dto';
import { ResolveSalesQueryDto } from './dto/resolve-sales-query.dto';
import { PackageInquiriesRepository } from './package-inquiries.repository';

@Injectable()
export class PackageInquiriesService {
  constructor(
    private readonly repository: PackageInquiriesRepository,
    private readonly config: ConfigService,
  ) {}

  create(
    input: CreatePackageInquiryDto & {
      packageType?: PackageType;
      organizationId?: string;
      subject?: string;
    },
  ) {
    return this.repository.create(input);
  }

  async list(dto: ListSalesQueriesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const { items, total } = await this.repository.list({
      packageType: dto.packageType,
      status: dto.status,
      search: dto.search,
      page,
      limit,
    });

    return {
      items: items.map((item) => ({
        id: String(item._id),
        organizationId: item.organizationId ?? null,
        packageType: item.packageType,
        fullName: item.fullName,
        email: item.email,
        subject: item.subject ?? null,
        message: item.message,
        status: item.status,
        resolutionNote: item.resolutionNote ?? null,
        resolvedAt: item.resolvedAt ?? null,
        resolvedByUserId: item.resolvedByUserId ?? null,
        consentAcceptedAt: item.consentAcceptedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const item = await this.repository.findById(id);
    if (!item) throw new NotFoundException('Sales query not found');
    return {
      id: String(item._id),
      organizationId: item.organizationId ?? null,
      packageType: item.packageType,
      fullName: item.fullName,
      email: item.email,
      subject: item.subject ?? null,
      message: item.message,
      status: item.status,
      resolutionNote: item.resolutionNote ?? null,
      resolvedAt: item.resolvedAt ?? null,
      resolvedByUserId: item.resolvedByUserId ?? null,
      consentAcceptedAt: item.consentAcceptedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async resolve(id: string, dto: ResolveSalesQueryDto, adminUserId: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Sales query not found');

    const updated = await this.repository.updateResolution(
      id,
      dto.status,
      dto.note,
      adminUserId,
    );

    return {
      message: `Sales query status updated to ${dto.status}`,
      query: {
        id: String(updated!._id),
        status: updated!.status,
        resolutionNote: updated!.resolutionNote ?? null,
        resolvedAt: updated!.resolvedAt ?? null,
        resolvedByUserId: updated!.resolvedByUserId ?? null,
      },
    };
  }

  async contactUser(
    id: string,
    dto: ContactUserSalesQueryDto,
    adminUserId: string,
  ) {
    const query = await this.repository.findById(id);
    if (!query) throw new NotFoundException('Sales query not found');

    await sendEmail(this.config, {
      to: query.email,
      subject: dto.subject,
      text: dto.message,
    });

    // Also update resolution status note
    await this.repository.updateResolution(
      id,
      query.status,
      `Contacted user via email: "${dto.subject}"`,
      adminUserId,
    );

    return {
      message: `Email successfully sent to ${query.email}`,
      recipient: query.email,
      subject: dto.subject,
    };
  }
}
