import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerFileStatus } from '../../common/enums/customer-file-status.enum';
import { CustomerFile } from '../../database/schemas/customer-file.schema';
import { ListContactContentQueryDto } from './dto/list-contact-content-query.dto';

const STORAGE_FIELDS =
  '+storageKey +storageAssetId +storageResourceType +storageDeliveryType +storageFormat';

@Injectable()
export class ContactFilesRepository {
  constructor(
    @InjectModel(CustomerFile.name)
    private readonly files: Model<CustomerFile>,
  ) {}

  async createMany(inputs: Record<string, unknown>[]) {
    const files = await this.files.insertMany(inputs, { ordered: true });
    return files.map(
      (file) => file.toObject() as unknown as Record<string, unknown>,
    );
  }

  async hardDeleteByIds(ids: string[]): Promise<void> {
    await this.files.deleteMany({ _id: { $in: ids } }).exec();
  }

  async list(
    organizationId: string,
    contactId: string,
    query: ListContactContentQueryDto,
  ) {
    const filter = {
      organizationId,
      contactId,
      status: CustomerFileStatus.ACTIVE,
    };
    const [items, total] = await Promise.all([
      this.files
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.files.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findWithStorage(organizationId: string, contactId: string, fileId: string) {
    return this.files
      .findOne({
        _id: fileId,
        organizationId,
        contactId,
        status: CustomerFileStatus.ACTIVE,
      })
      .select(STORAGE_FIELDS)
      .lean()
      .exec();
  }

  markDeletionPending(
    organizationId: string,
    contactId: string,
    fileId: string,
    userId: string,
  ) {
    return this.files
      .findOneAndUpdate(
        {
          _id: fileId,
          organizationId,
          contactId,
          status: {
            $in: [CustomerFileStatus.ACTIVE, CustomerFileStatus.DELETE_FAILED],
          },
        },
        {
          $set: {
            status: CustomerFileStatus.DELETION_PENDING,
            deletedAt: new Date(),
            deletedByUserId: userId,
          },
        },
        { new: true },
      )
      .select(STORAGE_FIELDS)
      .lean()
      .exec();
  }

  markDeleted(fileId: string) {
    return this.files
      .updateOne(
        { _id: fileId },
        {
          $set: { status: CustomerFileStatus.DELETED },
          $unset: { deletionError: 1 },
        },
      )
      .exec();
  }

  markDeleteFailed(fileId: string, message: string) {
    return this.files
      .updateOne(
        { _id: fileId },
        {
          $set: {
            status: CustomerFileStatus.DELETE_FAILED,
            deletionError: message.slice(0, 500),
          },
        },
      )
      .exec();
  }
}
