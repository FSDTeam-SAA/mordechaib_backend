import { Injectable } from '@nestjs/common';

@Injectable()
export class IntegrationsRepository {
  findAll() {
    return { module: 'integrations', items: [] };
  }
}
