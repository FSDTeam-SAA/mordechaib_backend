import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { CreateSetupPackageDto } from './dto/create-setup-package.dto';
import { UpdateSetupPackageDto } from './dto/update-setup-package.dto';
import { SetupPackagesRepository } from './setup-packages.repository';

type SetupPackageRulesInput = {
  setupType: SetupType;
  setupFeeType: SetupFeeType;
  price: number;
  currency: string;
};

@Injectable()
export class SetupPackagesService {
  constructor(private readonly repository: SetupPackagesRepository) {}

  findAll(includeInactive = false) {
    return this.repository.findAll(includeInactive);
  }

  findPublicCatalog() {
    return this.repository.findPublicCatalog();
  }

  async findById(id: string) {
    const setupPackage = await this.repository.findById(id);
    if (!setupPackage) throw new NotFoundException('Setup package not found');
    return setupPackage;
  }

  async findActiveById(id: string) {
    const setupPackage = await this.findById(id);
    if (!setupPackage.isActive) {
      throw new BadRequestException(
        'This setup package is no longer available',
      );
    }
    return setupPackage;
  }

  async create(dto: CreateSetupPackageDto, adminId: string) {
    const code = this.normalizeCode(dto.code);
    const existing = await this.repository.findByCode(code);
    if (existing) {
      throw new ConflictException(
        `A setup package with code ${code} already exists`,
      );
    }

    const rules = this.resolveRules(dto);
    return this.repository.create({
      code,
      name: dto.name.trim(),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...rules,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      priceHistory: [],
      createdBy: adminId,
      updatedBy: adminId,
    });
  }

  async update(id: string, dto: UpdateSetupPackageDto, adminId: string) {
    const existing = await this.findById(id);

    const code =
      dto.code === undefined ? existing.code : this.normalizeCode(dto.code);
    if (code !== existing.code) {
      const duplicate = await this.repository.findByCode(code);
      if (duplicate && String(duplicate._id) !== String(existing._id)) {
        throw new ConflictException(
          `A setup package with code ${code} already exists`,
        );
      }
    }

    const rules = this.resolveRules({
      setupType: dto.setupType ?? existing.setupType,
      setupFeeType: dto.setupFeeType ?? existing.setupFeeType,
      price: dto.price ?? existing.price,
      currency: dto.currency ?? existing.currency,
    });
    const priceChanged =
      rules.price !== existing.price || rules.currency !== existing.currency;

    const patch: Record<string, unknown> = {
      code,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...rules,
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      updatedBy: adminId,
    };

    if (priceChanged) {
      patch.$push = {
        priceHistory: {
          previousPrice: existing.price,
          nextPrice: rules.price,
          previousCurrency: existing.currency,
          nextCurrency: rules.currency,
          changedBy: adminId,
          changedAt: new Date(),
        },
      };
    }

    const updated = await this.repository.updateById(id, patch);
    if (!updated) throw new NotFoundException('Setup package not found');
    return updated;
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private resolveRules(input: SetupPackageRulesInput) {
    const paymentRequired = input.setupFeeType === SetupFeeType.PAID_ADDON;
    if (paymentRequired && input.setupType !== SetupType.DONE_FOR_YOU) {
      throw new BadRequestException(
        'A PAID_ADDON setup package must use DONE_FOR_YOU setup',
      );
    }
    if (paymentRequired && input.price <= 0) {
      throw new BadRequestException(
        'A PAID_ADDON setup package requires a price above zero',
      );
    }
    if (!paymentRequired && input.price !== 0) {
      throw new BadRequestException(
        'Only a PAID_ADDON setup package can have a setup price',
      );
    }

    return {
      setupType: input.setupType,
      setupFeeType: input.setupFeeType,
      price: input.price,
      currency: input.currency.trim().toUpperCase(),
      paymentRequired,
      meetingRequired: input.setupType === SetupType.DONE_FOR_YOU,
    };
  }
}
