import { Injectable } from '@nestjs/common';

@Injectable()
export class BillingRepository {
  findAll() {
    return { module: 'billing', items: [] };
  }
}
