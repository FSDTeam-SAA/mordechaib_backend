import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ExecutiveBriefingType,
  StrategicNoteKind,
} from '../../common/enums/executive-briefing.enum';
import { StrategicNotesRepository } from './strategic-notes.repository';
import { StrategicNotesService } from './strategic-notes.service';

describe('StrategicNotesService', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  let repository: Record<string, jest.Mock>;
  let service: StrategicNotesService;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockImplementation((value) => ({
        _id: '507f1f77bcf86cd799439011',
        ...value,
      })),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    service = new StrategicNotesService(
      repository as unknown as StrategicNotesRepository,
    );
  });

  it('creates a trimmed note for all briefing types by default', async () => {
    const result = await service.create(organizationId, userId, {
      content: '  Focus on enterprise renewals.  ',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        createdByUserId: userId,
        content: 'Focus on enterprise renewals.',
        kind: StrategicNoteKind.NOTE,
        appliesTo: Object.values(ExecutiveBriefingType),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: '507f1f77bcf86cd799439011',
        content: 'Focus on enterprise renewals.',
        kind: StrategicNoteKind.NOTE,
      }),
    );
  });

  it('rejects an invalid validity window', async () => {
    await expect(
      service.create(organizationId, userId, {
        content: 'Focus on renewals.',
        validFrom: '2026-09-18T10:00:00.000Z',
        validUntil: '2026-09-18T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores a typed strategic direction with a trimmed title', async () => {
    await service.create(organizationId, userId, {
      title: '  Enterprise focus  ',
      kind: StrategicNoteKind.STRATEGY,
      content: 'Prioritize enterprise renewals.',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Enterprise focus',
        kind: StrategicNoteKind.STRATEGY,
      }),
    );
  });

  it('returns not found when deleting a missing note', async () => {
    repository.softDelete.mockResolvedValue(null);

    await expect(
      service.remove(organizationId, userId, '507f1f77bcf86cd799439011'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
