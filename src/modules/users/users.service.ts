import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  findByOrganization(organizationId: string) {
    return this.repository.findByOrganization(organizationId);
  }

  findById(id: string) {
    return this.repository.findById(id);
  }
}