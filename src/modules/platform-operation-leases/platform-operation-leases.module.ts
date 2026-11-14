import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformOperationLease,
  PlatformOperationLeaseSchema,
} from '../../database/schemas/platform-operation-lease.schema';
import { PlatformOperationLeasesRepository } from './platform-operation-leases.repository';
import { PlatformOperationLeasesService } from './platform-operation-leases.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PlatformOperationLease.name,
        schema: PlatformOperationLeaseSchema,
      },
    ]),
  ],
  providers: [
    PlatformOperationLeasesRepository,
    PlatformOperationLeasesService,
  ],
  exports: [PlatformOperationLeasesService],
})
export class PlatformOperationLeasesModule {}
