import { Module } from '@nestjs/common';
import { SetupPackagesController } from './setup-packages.controller';
import { SetupPackagesRepository } from './setup-packages.repository';
import { SetupPackagesService } from './setup-packages.service';

@Module({
  controllers: [SetupPackagesController],
  providers: [SetupPackagesService, SetupPackagesRepository],
  exports: [SetupPackagesService],
})
export class SetupPackagesModule {}
