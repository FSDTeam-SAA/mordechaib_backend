import { ConflictException, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { PlatformOperationLeasesRepository } from './platform-operation-leases.repository';

const DEFAULT_LEASE_DURATION_MS = 5 * 60_000;

@Injectable()
export class PlatformOperationLeasesService {
  constructor(private readonly repository: PlatformOperationLeasesRepository) {}

  async runExclusive<T>(input: {
    scope: string;
    resourceId: string;
    operation: string;
    actorUserId: string;
    execute: () => Promise<T>;
  }): Promise<T> {
    const key = `${input.scope}:${input.resourceId}`;
    const token = crypto.randomUUID();
    const now = new Date();
    const acquired = await this.repository.acquire({
      key,
      operation: input.operation,
      token,
      actorUserId: input.actorUserId,
      now,
      expiresAt: new Date(now.getTime() + DEFAULT_LEASE_DURATION_MS),
    });
    if (!acquired) {
      throw new ConflictException(
        'Another operation is already in progress for this resource',
      );
    }

    try {
      return await input.execute();
    } finally {
      await this.repository.release(key, token).catch(() => undefined);
    }
  }
}
