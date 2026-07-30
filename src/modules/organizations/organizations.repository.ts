import { Injectable } from '@nestjs/common';

@Injectable()
export class OrganizationsRepository {
  findAll() {
    return { module: 'organizations', items: [] };
  }
}
