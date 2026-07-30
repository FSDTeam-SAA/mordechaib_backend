import { Injectable } from '@nestjs/common';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(private readonly repository: OrganizationsRepository) {}

  findAll() {
    return this.repository.findAll();
  }
}
