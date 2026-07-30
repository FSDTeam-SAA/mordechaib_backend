import { Injectable } from '@nestjs/common';

@Injectable()
export class TasksRepository {
  findAll() {
    return { module: 'tasks', items: [] };
  }
}
