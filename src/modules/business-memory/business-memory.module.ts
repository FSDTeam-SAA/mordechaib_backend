import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiServiceSecretGuard } from '../../common/guards/ai-service-secret.guard';
import {
  BusinessMemory,
  BusinessMemorySchema,
} from '../../database/schemas/business-memory.schema';
import { AiSourceContextModule } from '../ai-internal/ai-internal.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AiBusinessMemoryController } from './ai-business-memory.controller';
import { BusinessMemoryController } from './business-memory.controller';
import { BusinessMemoryRepository } from './business-memory.repository';
import { BusinessMemoryService } from './business-memory.service';

@Module({
  imports: [
    ContactsModule,
    AiSourceContextModule,
    MongooseModule.forFeature([
      { name: BusinessMemory.name, schema: BusinessMemorySchema },
    ]),
  ],
  controllers: [BusinessMemoryController, AiBusinessMemoryController],
  providers: [
    BusinessMemoryService,
    BusinessMemoryRepository,
    AiServiceSecretGuard,
  ],
  exports: [BusinessMemoryService],
})
export class BusinessMemoryModule {}
