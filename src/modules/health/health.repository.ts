import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthRepository {
  findAll() {
    return { module: 'health', items: [] };
  }
}
