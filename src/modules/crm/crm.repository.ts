import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CrmProviderType } from '../../common/types/crm-provider.interface';
import {
  Integration,
  IntegrationProvider,
} from '../../database/schemas/integration.schema';

const CRM_PROVIDERS: CrmProviderType[] = [
  IntegrationProvider.HUBSPOT,
  IntegrationProvider.SALESFORCE,
];

@Injectable()
export class CrmRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
  ) {}

  find(organizationId: string, provider: CrmProviderType) {
    return this.integrationModel
      .findOne({
        organizationId,
        provider,
      })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  findConnected(organizationId: string, provider: CrmProviderType) {
    return this.integrationModel
      .findOne({ organizationId, provider, status: 'CONNECTED' })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  findDefaultConnected(organizationId: string) {
    return this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CRM_PROVIDERS },
        status: 'CONNECTED',
        isDefaultCrm: true,
      })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  listConnected(organizationId?: string) {
    return this.integrationModel
      .find({
        ...(organizationId ? { organizationId } : {}),
        provider: { $in: CRM_PROVIDERS },
        status: 'CONNECTED',
      })
      .select('+accessToken +refreshToken')
      .sort({ organizationId: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  upsert(
    organizationId: string,
    provider: CrmProviderType,
    input: Partial<Integration>,
  ) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider },
        { $set: { ...input, organizationId, provider } },
        { new: true, upsert: true, runValidators: true },
      )
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  update(organizationId: string, provider: CrmProviderType, input: object) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider },
        { $set: input },
        { new: true, runValidators: true },
      )
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  claimSync(
    organizationId: string,
    provider: CrmProviderType,
    metadata: Record<string, unknown>,
    staleBefore: Date,
  ) {
    return this.integrationModel
      .findOneAndUpdate(
        {
          organizationId,
          provider,
          status: 'CONNECTED',
          $or: [
            { 'metadata.syncStatus': { $ne: 'SYNCING' } },
            { 'metadata.syncStartedAt': { $lt: staleBefore.toISOString() } },
          ],
        },
        { $set: { metadata } },
        { new: true, runValidators: true },
      )
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  async ensureDefault(organizationId: string) {
    const current = await this.integrationModel.exists({
      organizationId,
      provider: { $in: CRM_PROVIDERS },
      status: 'CONNECTED',
      isDefaultCrm: true,
    });
    if (current) return;
    const candidate = await this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CRM_PROVIDERS },
        status: 'CONNECTED',
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    if (!candidate) return;
    try {
      await this.integrationModel.updateOne(
        { _id: candidate._id, status: 'CONNECTED' },
        { $set: { isDefaultCrm: true } },
      );
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
    }
  }

  async setDefault(organizationId: string, provider: CrmProviderType) {
    const target = await this.integrationModel
      .findOne({ organizationId, provider, status: 'CONNECTED' })
      .lean()
      .exec();
    if (!target) {
      throw new ConflictException(
        'The selected CRM must be connected before it can be the default',
      );
    }
    if (target.isDefaultCrm) return target;
    const previous = await this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CRM_PROVIDERS },
        isDefaultCrm: true,
      })
      .lean()
      .exec();
    await this.integrationModel.updateMany(
      { organizationId, provider: { $in: CRM_PROVIDERS }, isDefaultCrm: true },
      { $set: { isDefaultCrm: false } },
    );
    try {
      return await this.integrationModel
        .findOneAndUpdate(
          { organizationId, provider, status: 'CONNECTED' },
          { $set: { isDefaultCrm: true } },
          { new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      if (previous) {
        await this.integrationModel
          .updateOne({ _id: previous._id }, { $set: { isDefaultCrm: true } })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async disconnect(organizationId: string, provider: CrmProviderType) {
    const disconnected = await this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider },
        {
          $set: { status: 'DISCONNECTED', isDefaultCrm: false },
          $unset: { accessToken: 1, refreshToken: 1, expiresAt: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.ensureDefault(organizationId);
    return disconnected;
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    );
  }
}
