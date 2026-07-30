import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersRepository {
  findAll() {
    return { module: 'users', items: [] };
  }
}
