import { Injectable } from '@nestjs/common';
import { UsageRepository } from './usage.repository';

@Injectable()
export class UsageService {
  constructor(private readonly repository: UsageRepository) {}

  findAll() {
    return this.repository.findAll();
  }
}
