import { Injectable } from '@nestjs/common';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { ContactCrmLinksService } from './contact-crm-links.service';
import { ContactWorkspaceRepository } from './contact-workspace.repository';
import { ContactsService } from './contacts.service';
import { GetContactWorkspaceQueryDto } from './dto/get-contact-workspace-query.dto';
import { ContactCommercialSummaryService } from './contact-commercial-summary.service';
import { ContactWorkspaceActionsService } from './contact-workspace-actions.service';

type WorkspaceCapability = {
  available: boolean;
  reason: string | null;
};

@Injectable()
export class ContactWorkspaceService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly crmLinks: ContactCrmLinksService,
    private readonly repository: ContactWorkspaceRepository,
    private readonly commercialSummary: ContactCommercialSummaryService,
    private readonly workspaceActions: ContactWorkspaceActionsService,
  ) {}

  async get(
    organizationId: string,
    contactId: string,
    query: GetContactWorkspaceQueryDto,
    actorRole: UserRole,
    asOf = new Date(),
  ) {
    const profile = await this.contacts.get(organizationId, contactId);
    const [crm, tasks, meetings, calls, latestHealth, notes, files] =
      await Promise.all([
        this.crmLinks.list(organizationId, contactId),
        this.repository.openTasks(organizationId, contactId, query.taskLimit),
        this.repository.upcomingMeetings(
          organizationId,
          contactId,
          query.meetingLimit,
          asOf,
        ),
        this.repository.recentCalls(organizationId, contactId, query.callLimit),
        this.repository.latestHealth(organizationId, contactId),
        this.repository.recentNotes(organizationId, contactId, query.noteLimit),
        this.repository.recentFiles(organizationId, contactId, query.fileLimit),
      ]);
    const dealLinks = crm.items.filter((link) =>
      this.isDealObjectType(String(link.objectType)),
    );
    const linkedDeals = await this.repository.linkedDeals(
      organizationId,
      dealLinks.map((link) => ({
        provider: String(link.provider),
        externalId: String(link.externalId),
      })),
    );
    const intelligence = this.commercialSummary.build({
      profile,
      crmLinks: dealLinks,
      deals: linkedDeals as unknown as Record<string, unknown>[],
      latestHealth: latestHealth
        ? (latestHealth as unknown as Record<string, unknown>)
        : null,
    });

    const active = profile.status === CustomerContactStatus.ACTIVE;
    const capabilities = {
      call: this.capability(
        active,
        this.isOwnerOrAdmin(actorRole),
        Boolean(profile.phone),
        'PHONE_MISSING',
      ),
      email: this.capability(
        active,
        actorRole === UserRole.OWNER,
        Boolean(profile.email),
        'EMAIL_MISSING',
      ),
      scheduleMeeting: this.capability(
        active,
        this.isOwnerOrAdmin(actorRole),
        Boolean(profile.email),
        'EMAIL_MISSING',
      ),
      createTask: this.capability(
        active,
        this.isOwnerOrAdmin(actorRole),
        true,
        'CONTACT_UNAVAILABLE',
      ),
    };
    return {
      contactId,
      organizationId,
      asOf: asOf.toISOString(),
      profile,
      capabilities,
      actionContract: this.workspaceActions.build({
        contactId,
        email: typeof profile.email === 'string' ? profile.email : undefined,
        capabilities,
      }),
      crm: this.crmSummary(crm.items),
      tasks: {
        availability: 'AVAILABLE',
        totalOpen: tasks.total,
        limit: query.taskLimit,
        items: tasks.items.map((item) => {
          const task = this.publicRecord(item);
          const dueDate = this.date(task.dueDate);
          return {
            ...task,
            isOverdue:
              task.status !== TaskStatus.COMPLETED &&
              Boolean(dueDate && dueDate.getTime() < asOf.getTime()),
          };
        }),
      },
      meetings: {
        availability: 'AVAILABLE',
        totalUpcoming: meetings.total,
        limit: query.meetingLimit,
        items: meetings.items.map((item) => this.publicRecord(item)),
      },
      calls: {
        availability: 'AVAILABLE',
        total: calls.total,
        limit: query.callLimit,
        items: calls.items.map((item) => this.publicRecord(item)),
      },
      health: latestHealth
        ? {
            availability: 'AVAILABLE',
            latest: this.publicRecord(latestHealth),
          }
        : { availability: 'UNAVAILABLE', latest: null },
      notes: {
        availability: 'AVAILABLE',
        total: notes.total,
        limit: query.noteLimit,
        items: notes.items.map((item) => this.publicRecord(item)),
      },
      files: {
        availability: 'AVAILABLE',
        total: files.total,
        limit: query.fileLimit,
        items: files.items.map((item) => this.publicRecord(item)),
      },
      ...intelligence,
    };
  }

  private capability(
    active: boolean,
    roleAllowed: boolean,
    requirementMet: boolean,
    missingReason: string,
  ): WorkspaceCapability {
    if (!active) return { available: false, reason: 'CONTACT_ARCHIVED' };
    if (!roleAllowed) return { available: false, reason: 'ROLE_NOT_ALLOWED' };
    if (!requirementMet) return { available: false, reason: missingReason };
    return { available: true, reason: null };
  }

  private isOwnerOrAdmin(role: UserRole) {
    return role === UserRole.OWNER || role === UserRole.ADMIN;
  }

  private crmSummary(links: Array<Record<string, unknown>>) {
    const providers = new Set<string>();
    const objectCounts = new Map<string, number>();
    const items = links.map((link) => {
      const provider = String(link.provider);
      const objectType = String(link.objectType);
      providers.add(provider);
      objectCounts.set(objectType, (objectCounts.get(objectType) || 0) + 1);
      const record = this.record(link.record);
      return {
        id: link.id,
        crmRecordId: link.crmRecordId,
        provider,
        objectType,
        externalId: link.externalId,
        recordAvailable: Boolean(record),
        archived: record?.archived === true,
        providerUpdatedAt: record?.providerUpdatedAt,
        syncedAt: record?.syncedAt,
        linkedAt: link.createdAt,
      };
    });
    return {
      availability: items.length ? 'AVAILABLE' : 'UNAVAILABLE',
      total: items.length,
      providers: [...providers],
      objectTypes: [...objectCounts.entries()].map(([objectType, count]) => ({
        objectType,
        count,
      })),
      items,
    };
  }

  private record(value: unknown) {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private publicRecord(
    value: object,
  ): Record<string, unknown> & { id: string } {
    const record = value as unknown as Record<string, unknown>;
    const { _id, __v, organizationId, ...response } = record;
    void __v;
    void organizationId;
    return { id: String(_id), ...response };
  }

  private date(value: unknown) {
    if (!value) return undefined;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private isDealObjectType(value: string) {
    return ['deal', 'deals', 'opportunity', 'opportunities'].includes(
      value.trim().toLowerCase(),
    );
  }
}
