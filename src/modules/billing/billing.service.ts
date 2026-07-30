import { Injectable } from '@nestjs/common';
import { BillingRepository } from './billing.repository';

@Injectable()
export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  findAll() {
    return this.repository.findAll();
  }
}
