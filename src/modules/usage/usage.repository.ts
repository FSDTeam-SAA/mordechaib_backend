import { Injectable } from '@nestjs/common';

@Injectable()
export class UsageRepository {
  findAll() {
    return { module: 'usage', items: [] };
  }
}
