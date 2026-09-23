import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import {
  ExecutiveBriefingType,
  StrategicNoteKind,
} from '../../common/enums/executive-briefing.enum';
import { CreateStrategicNoteDto } from './dto/create-strategic-note.dto';
import { ListStrategicNotesQueryDto } from './dto/list-strategic-notes-query.dto';
import { UpdateStrategicNoteDto } from './dto/update-strategic-note.dto';
import { StrategicNotesRepository } from './strategic-notes.repository';

@Injectable()
export class StrategicNotesService {
  constructor(private readonly repository: StrategicNotesRepository) {}

  async create(
    organizationId: string,
    userId: string,
    input: CreateStrategicNoteDto,
  ) {
    const values = this.values(input);
    return this.response(
      await this.repository.create({
        organizationId,
        createdByUserId: userId,
        ...values,
      }),
    );
  }

  async list(organizationId: string, query: ListStrategicNotesQueryDto) {
    const result = await this.repository.list(
      organizationId,
      query.page,
      query.limit,
      query.activeAt ? new Date(query.activeAt) : undefined,
    );
    return {
      items: result.items.map((item) => this.response(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateStrategicNoteDto,
  ) {
    this.assertId(id);
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('No strategic note changes were provided');
    }
    const current = await this.repository.findById(organizationId, id);
    if (!current) throw new NotFoundException('Strategic note not found');
    const values = this.values(input, current);
    const updated = await this.repository.update(organizationId, id, values);
    if (!updated) throw new NotFoundException('Strategic note not found');
    return this.response(updated);
  }

  async remove(organizationId: string, userId: string, id: string) {
    this.assertId(id);
    const deleted = await this.repository.softDelete(
      organizationId,
      id,
      userId,
    );
    if (!deleted) throw new NotFoundException('Strategic note not found');
    return { id, deleted: true };
  }

  private values(
    input: CreateStrategicNoteDto | UpdateStrategicNoteDto,
    current?: Record<string, unknown>,
  ) {
    const content = input.content?.trim();
    const title = input.title?.trim();
    if (input.content !== undefined && !content) {
      throw new BadRequestException('Strategic note content cannot be empty');
    }
    if (input.title !== undefined && !title) {
      throw new BadRequestException('Strategic note title cannot be empty');
    }
    const validFrom = input.validFrom
      ? new Date(input.validFrom)
      : current?.validFrom instanceof Date
        ? current.validFrom
        : new Date();
    const validUntil = input.validUntil
      ? new Date(input.validUntil)
      : current?.validUntil instanceof Date
        ? current.validUntil
        : undefined;
    if (validUntil && validUntil <= validFrom) {
      throw new BadRequestException('validUntil must be after validFrom');
    }
    return {
      ...(content !== undefined ? { content } : {}),
      ...(title !== undefined ? { title } : {}),
      kind:
        input.kind ||
        (current?.kind as StrategicNoteKind | undefined) ||
        StrategicNoteKind.NOTE,
      appliesTo:
        input.appliesTo === undefined
          ? current?.appliesTo || Object.values(ExecutiveBriefingType)
          : [...new Set(input.appliesTo)],
      validFrom,
      ...(validUntil ? { validUntil } : {}),
    };
  }

  private response(value: unknown) {
    const record = value as Record<string, unknown>;
    const { _id, __v, organizationId, deletedAt, deletedByUserId, ...note } =
      record;
    void __v;
    void organizationId;
    void deletedAt;
    void deletedByUserId;
    return { id: String(_id), ...note };
  }

  private assertId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid strategic note id');
    }
  }
}
