import { Controller, Get } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
