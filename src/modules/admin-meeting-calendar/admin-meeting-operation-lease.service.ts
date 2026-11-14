import { ConflictException, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { AdminMeetingOperationLeaseRepository } from './admin-meeting-operation-lease.repository';

const LEASE_DURATION_MS = 5 * 60_000;

@Injectable()
export class AdminMeetingOperationLeaseService {
  constructor(
    private readonly repository: AdminMeetingOperationLeaseRepository,
  ) {}

  async run<T>(input: {
    key: string;
    operation: string;
    actorUserId: string;
    execute: () => Promise<T>;
  }): Promise<T> {
    const token = crypto.randomUUID();
    const now = new Date();
    const acquired = await this.repository.acquire({
      key: input.key,
      operation: input.operation,
      token,
      actorUserId: input.actorUserId,
      now,
      expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
    });
    if (!acquired) {
      throw new ConflictException(
        'Another operation is already in progress for this resource',
      );
    }

    try {
      return await input.execute();
    } finally {
      await this.repository.release(input.key, token).catch(() => undefined);
    }
  }
}
