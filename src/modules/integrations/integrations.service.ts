import { Injectable } from '@nestjs/common';
import { IntegrationsRepository } from './integrations.repository';

@Injectable()
export class IntegrationsService {
  constructor(private readonly repository: IntegrationsRepository) {}

  findAll() {
    return this.repository.findAll();
  }
}
