import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthRepository {
  findAll() {
    return { module: 'auth', items: [] };
  }
}
