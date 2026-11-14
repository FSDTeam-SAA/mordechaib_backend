import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isValidObjectId } from 'mongoose';
import {
  BusinessMemoryKind,
  BusinessMemorySourceType,
  BusinessMemoryStatus,
} from '../../common/enums/business-memory.enum';
import { BusinessMemory } from '../../database/schemas/business-memory.schema';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { ContactsService } from '../contacts/contacts.service';
import {
  BusinessMemoryRecord,
  BusinessMemoryRepository,
} from './business-memory.repository';
import { CreateBusinessMemoryDto } from './dto/create-business-memory.dto';
import { ListBusinessMemoriesQueryDto } from './dto/list-business-memories-query.dto';
import { RecallBusinessMemoryQueryDto } from './dto/recall-business-memory-query.dto';
import { UpdateBusinessMemoryDto } from './dto/update-business-memory.dto';

/** A memory an AI agent proposes; Main Backend validates it before storing. */
export type BusinessMemoryCandidate = {
  kind: BusinessMemoryKind;
  content: string;
  contactIds?: string[];
  dueOn?: string;
};

export type BusinessMemoryProvenance = {
  messageId: string;
  conversationId: string;
  agent?: { id: string; name: string; type: string };
};

/** Company-wide memories every turn may need, whatever it is about. */
const ALWAYS_RELEVANT = [
  BusinessMemoryKind.GOAL,
  BusinessMemoryKind.FINANCIAL_TARGET,
];
const MAX_CANDIDATES = 5;

@Injectable()
export class BusinessMemoryService {
  private readonly logger = new Logger(BusinessMemoryService.name);

  constructor(
    private readonly repository: BusinessMemoryRepository,
    private readonly contacts: ContactsService,
    private readonly sourceContext: AiSourceContextService,
  ) {}

  // ---------------------------------------------------------------------------
  // Owner and admin
  // ---------------------------------------------------------------------------

  /** A memory written by the owner is trusted: ACTIVE immediately. */
  async create(
    organizationId: string,
    userId: string,
    input: CreateBusinessMemoryDto,
  ) {
    const contactIds = await this.knownContacts(
      organizationId,
      input.contactIds ?? [],
      true,
    );
    try {
      return this.response(
        await this.repository.create({
          organizationId,
          kind: input.kind,
          status: BusinessMemoryStatus.ACTIVE,
          content: input.content.trim(),
          contactIds,
          userIds: [...new Set(input.userIds ?? [])],
          ...(input.dueOn ? { dueOn: input.dueOn } : {}),
          source: { type: BusinessMemorySourceType.MANUAL },
          fingerprint: this.fingerprint(input.kind, input.content),
          createdByUserId: userId,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        }),
      );
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  async list(organizationId: string, query: ListBusinessMemoriesQueryDto) {
    const result = await this.repository.list(
      organizationId,
      {
        status: query.status,
        kind: query.kind,
        contactId: query.contactId,
        search: query.search?.trim() || undefined,
      },
      query.page,
      query.limit,
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
    input: UpdateBusinessMemoryDto,
  ) {
    this.assertId(id);
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('No business memory changes were provided');
    }
    const current = await this.repository.findById(organizationId, id);
    if (!current || current.status === BusinessMemoryStatus.ARCHIVED) {
      throw new NotFoundException('Business memory not found');
    }
    const kind = input.kind ?? current.kind;
    const content = input.content?.trim() ?? current.content;
    const values: Partial<BusinessMemory> = {
      kind,
      content,
      fingerprint: this.fingerprint(kind, content),
      ...(input.contactIds
        ? {
            contactIds: await this.knownContacts(
              organizationId,
              input.contactIds,
              true,
            ),
          }
        : {}),
      ...(input.userIds ? { userIds: [...new Set(input.userIds)] } : {}),
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
    };
    try {
      const updated = await this.repository.update(organizationId, id, values);
      if (!updated) throw new NotFoundException('Business memory not found');
      return this.response(updated);
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /** Pending (or previously rejected) memory -> ACTIVE: Laura may use it now. */
  approve(organizationId: string, userId: string, id: string) {
    return this.review(
      organizationId,
      userId,
      id,
      BusinessMemoryStatus.ACTIVE,
      [BusinessMemoryStatus.PENDING_REVIEW, BusinessMemoryStatus.REJECTED],
    );
  }

  /** Rejected memories are kept so the same fact is not proposed again. */
  reject(organizationId: string, userId: string, id: string) {
    return this.review(
      organizationId,
      userId,
      id,
      BusinessMemoryStatus.REJECTED,
      [BusinessMemoryStatus.PENDING_REVIEW, BusinessMemoryStatus.ACTIVE],
    );
  }

  async archive(organizationId: string, userId: string, id: string) {
    this.assertId(id);
    const archived = await this.repository.update(
      organizationId,
      id,
      {
        status: BusinessMemoryStatus.ARCHIVED,
        archivedAt: new Date(),
        archivedByUserId: userId,
      },
      [
        BusinessMemoryStatus.PENDING_REVIEW,
        BusinessMemoryStatus.ACTIVE,
        BusinessMemoryStatus.REJECTED,
      ],
    );
    if (!archived) throw new NotFoundException('Business memory not found');
    return { id, archived: true };
  }

  // ---------------------------------------------------------------------------
  // AI agents
  // ---------------------------------------------------------------------------

  /**
   * Stores what an agent learned from an organizer message, for the owner to
   * review. Never throws: memory is secondary and must not fail a chat turn.
   */
  async ingestFromChat(
    organizationId: string,
    candidates: BusinessMemoryCandidate[],
    provenance: BusinessMemoryProvenance,
  ): Promise<number> {
    try {
      const valid = candidates
        .slice(0, MAX_CANDIDATES)
        .filter((candidate) => candidate.content.trim());
      if (!valid.length) return 0;
      const known = new Set(
        await this.knownContacts(
          organizationId,
          valid.flatMap((candidate) => candidate.contactIds ?? []),
          false,
        ),
      );
      const created = await this.repository.insertNew(
        organizationId,
        valid.map((candidate) => ({
          organizationId,
          kind: candidate.kind,
          status: BusinessMemoryStatus.PENDING_REVIEW,
          content: candidate.content.trim(),
          // Only real customers of this organization; anything else is dropped.
          contactIds: [...new Set(candidate.contactIds ?? [])].filter((id) =>
            known.has(id),
          ),
          userIds: [],
          ...(candidate.dueOn ? { dueOn: candidate.dueOn } : {}),
          source: {
            type: BusinessMemorySourceType.USER_MESSAGE,
            messageId: provenance.messageId,
            conversationId: provenance.conversationId,
          },
          ...(provenance.agent ? { proposedByAgent: provenance.agent } : {}),
          fingerprint: this.fingerprint(candidate.kind, candidate.content),
        })),
      );
      if (created) {
        this.logger.log(
          `Business memory proposed: organizationId=${organizationId} messageId=${provenance.messageId} count=${created}`,
        );
      }
      return created;
    } catch (error) {
      this.logger.error(
        `Business memory could not be stored: organizationId=${organizationId} messageId=${provenance.messageId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return 0;
    }
  }

  /**
   * ACTIVE memories for one turn: those about the turn's customers first, then
   * text matches, then the company's goals and targets.
   */
  async recall(organizationId: string, query: RecallBusinessMemoryQueryDto) {
    await this.sourceContext.requireActiveRequester(
      organizationId,
      query.requesterUserId,
    );
    const limit = query.limit;
    const search = query.search?.trim();
    const [linked, matching, company] = await Promise.all([
      this.repository.activeForContacts(
        organizationId,
        [...new Set(query.contactIds ?? [])],
        limit,
      ),
      search
        ? this.repository.activeMatching(organizationId, search, limit)
        : Promise.resolve([]),
      this.repository.activeOfKinds(organizationId, ALWAYS_RELEVANT, 5),
    ]);
    const seen = new Set<string>();
    const items = [...linked, ...matching, ...company]
      .filter((item) => {
        const id = String(item._id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, limit);
    return {
      organizationId,
      items: items.map((item) => ({
        id: String(item._id),
        kind: item.kind,
        content: item.content,
        contactIds: item.contactIds ?? [],
        userIds: item.userIds ?? [],
        ...(item.dueOn ? { dueOn: item.dueOn } : {}),
        updatedAt: item.updatedAt?.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------------------

  private async review(
    organizationId: string,
    userId: string,
    id: string,
    status: BusinessMemoryStatus,
    from: BusinessMemoryStatus[],
  ) {
    this.assertId(id);
    const updated = await this.repository.update(
      organizationId,
      id,
      { status, reviewedByUserId: userId, reviewedAt: new Date() },
      from,
    );
    if (!updated) {
      throw new NotFoundException(
        'Business memory not found or not in a reviewable state',
      );
    }
    return this.response(updated);
  }

  /**
   * Contact ids that are active customers of the organization. With `strict`
   * an unknown id is a 400 (owner input); otherwise unknown ids are dropped.
   */
  private async knownContacts(
    organizationId: string,
    ids: string[],
    strict: boolean,
  ) {
    const unique = [...new Set(ids)].filter((id) => isValidObjectId(id));
    if (!unique.length) return [];
    const found = (
      await this.contacts.listActiveSummaries(organizationId, unique)
    ).map((contact) => contact.id);
    if (strict && found.length !== unique.length) {
      throw new BadRequestException('Unknown customer id');
    }
    return found;
  }

  fingerprint(kind: BusinessMemoryKind, content: string) {
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!?\s]+$/, '')
      .trim();
    return createHash('sha256').update(`${kind}|${normalized}`).digest('hex');
  }

  private duplicate(error: unknown) {
    if ((error as { code?: number })?.code === 11000) {
      return new ConflictException('This business memory already exists');
    }
    return error;
  }

  private assertId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid business memory id');
    }
  }

  private response(item: BusinessMemoryRecord) {
    return {
      id: String(item._id),
      kind: item.kind,
      status: item.status,
      content: item.content,
      contactIds: item.contactIds ?? [],
      userIds: item.userIds ?? [],
      ...(item.dueOn ? { dueOn: item.dueOn } : {}),
      source: item.source,
      ...(item.proposedByAgent
        ? { proposedByAgent: item.proposedByAgent }
        : {}),
      ...(item.reviewedAt ? { reviewedAt: item.reviewedAt } : {}),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
