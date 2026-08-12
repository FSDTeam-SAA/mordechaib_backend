import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';
import { MetaRepository } from './meta.repository';
import { MetaProvider } from './providers/meta.provider';

@Module({
  controllers: [MetaController],
  providers: [MetaService, MetaRepository, MetaProvider],
})
export class MetaModule {}
