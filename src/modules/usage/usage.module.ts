import { Module } from '@nestjs/common';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { UsageRepository } from './usage.repository';

@Module({
  controllers: [UsageController],
  providers: [UsageService, UsageRepository],
  exports: [UsageService],
})
export class UsageModule {}
