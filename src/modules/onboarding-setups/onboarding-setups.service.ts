import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminNote,
  OnboardingSetup,
  StatusHistoryEntry,
} from '../../database/schemas/onboarding-setup.schema';
import { IntegrationSetupStatus } from '../../common/enums/integration-setup-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { SetupPaymentStatus } from '../../common/enums/setup-payment-status.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { CalendarService } from '../calendar/calendar.service';
import { AddAdminNoteDto } from './dto/add-admin-note.dto';
import { AssignAdminDto } from './dto/assign-admin.dto';
import { BookSetupMeetingDto } from './dto/book-setup-meeting.dto';
import { ChangeSetupStatusDto } from './dto/change-setup-status.dto';
import { CreateOnboardingSetupDto } from './dto/create-onboarding-setup.dto';
import { OnboardingSetupQueryDto } from './dto/onboarding-setup-query.dto';
import { UpdateOnboardingSetupDto } from './dto/update-onboarding-setup.dto';
import { UpdateSetupPaymentDto } from './dto/update-setup-payment.dto';
import { UpdateSetupProgressDto } from './dto/update-setup-progress.dto';
import { SetupProgressHelper } from '../../common/helpers/setup-progress.helper';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';

const STATUS_MESSAGES: Record<SetupStatus, string> = {
  [SetupStatus.NOT_STARTED]: 'Setup has not started yet',
  [SetupStatus.PAYMENT_PENDING]: 'Complete payment to continue',
  [SetupStatus.PAYMENT_COMPLETED]: 'Choose your setup meeting time',
  [SetupStatus.MEETING_PENDING]: 'Book your onboarding call',
  [SetupStatus.MEETING_SCHEDULED]: 'Your setup call is scheduled',
  [SetupStatus.REQUIREMENT_COLLECTED]:
    'Our team is reviewing your requirements',
  [SetupStatus.SETUP_IN_PROGRESS]: 'Your Noltra setup is in progress',
  [SetupStatus.TESTING]: 'We are testing your setup',
  [SetupStatus.COMPLETED]: 'Your AI workforce is ready',
  [SetupStatus.CANCELLED]: 'Setup was cancelled',
};

const ALLOWED_TRANSITIONS: Record<SetupStatus, SetupStatus[]> = {
  [SetupStatus.NOT_STARTED]: [
    SetupStatus.PAYMENT_PENDING,
    SetupStatus.MEETING_PENDING,
    SetupStatus.CANCELLED,
  ],
  [SetupStatus.PAYMENT_PENDING]: [
    SetupStatus.PAYMENT_COMPLETED,
    SetupStatus.CANCELLED,
  ],
  [SetupStatus.PAYMENT_COMPLETED]: [
    SetupStatus.MEETING_PENDING,
    SetupStatus.CANCELLED,
  ],
  [SetupStatus.MEETING_PENDING]: [
    SetupStatus.MEETING_SCHEDULED,
    SetupStatus.CANCELLED,
  ],
  [SetupStatus.MEETING_SCHEDULED]: [
    SetupStatus.REQUIREMENT_COLLECTED,
    SetupStatus.CANCELLED,
  ],
  [SetupStatus.REQUIREMENT_COLLECTED]: [
    SetupStatus.SETUP_IN_PROGRESS,
    SetupStatus.CANCELLED,
  ],
  [SetupStatus.SETUP_IN_PROGRESS]: [SetupStatus.TESTING, SetupStatus.CANCELLED],
  [SetupStatus.TESTING]: [SetupStatus.COMPLETED, SetupStatus.CANCELLED],
  [SetupStatus.COMPLETED]: [],
  [SetupStatus.CANCELLED]: [],
};

@Injectable()
export class OnboardingSetupsService {
  constructor(
    private readonly repository: OnboardingSetupsRepository,
    private readonly calendarService: CalendarService,
  ) {}

  async create(user: RequestUser, dto: CreateOnboardingSetupDto) {
    const existing = await this.repository.findActiveByOrganization(
      user.organizationId,
    );
    if (existing) {
      throw new ConflictException(
        'An active onboarding setup already exists for this organization',
      );
    }

    const defaults = this.resolvePackageDefaults(dto);
    const setup = await this.repository.create({
      organizationId: user.organizationId,
      organizerId: user.id,
      createdBy: user.id,
      ...defaults,
      ...dto,
    });

    await this.pushStatusHistory(
      String(setup._id),
      setup.status,
      user.id,
      'Onboarding setup created',
    );

    return setup;
  }

  async findMy(user: RequestUser) {
    const setup = await this.repository.findActiveByOrganization(
      user.organizationId,
    );
    if (!setup) {
      throw new NotFoundException('No onboarding setup found');
    }
    return this.toOrganizerView(setup);
  }

  async findById(id: string, user: RequestUser) {
    const setup = await this.repository.findById(id, user.organizationId);
    if (!setup) {
      throw new NotFoundException('Onboarding setup not found');
    }
    return this.toOrganizerView(setup);
  }

  async update(id: string, user: RequestUser, dto: UpdateOnboardingSetupDto) {
    const setup = await this.requireOwnedSetup(id, user);
    this.assertNotTerminal(setup.status);

    const requirementsUpdate = dto.requirements
      ? this.buildRequirementsUpdate(dto.requirements)
      : {};

    const updated = await this.repository.update(
      id,
      { $set: { ...requirementsUpdate, updatedBy: user.id } },
      user.organizationId,
    );
    return this.toOrganizerView(updated!);
  }

  async bookMeeting(id: string, user: RequestUser, dto: BookSetupMeetingDto) {
    const setup = await this.requireOwnedSetup(id, user);

    if (
      setup.status !== SetupStatus.MEETING_PENDING &&
      setup.status !== SetupStatus.PAYMENT_COMPLETED
    ) {
      throw new BadRequestException(
        'Meeting can only be booked when a meeting is pending',
      );
    }
    if (!setup.meeting?.isRequired) {
      throw new BadRequestException('This setup does not require a meeting');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (start >= end) {
      throw new BadRequestException('startTime must be before endTime');
    }

    let calendarEventId: string | undefined;
    let meetingLink = dto.meetingLink;

    if (dto.calendarProvider && dto.calendarProvider !== 'MANUAL') {
      try {
        const event = (await this.calendarService.createEvent(
          user.organizationId,
          {
            title: 'Noltra Onboarding & Setup Call',
            startTime: dto.startTime,
            endTime: dto.endTime,
          },
        )) as { id?: string } | null;
        calendarEventId = event?.id;
      } catch {
        // Fall back to manual meeting link if calendar integration fails
      }
    }

    const updated = await this.repository.update(
      id,
      {
        $set: {
          'meeting.meetingDate': start,
          'meeting.startTime': start,
          'meeting.endTime': end,
          'meeting.timezone': dto.timezone || setup.meeting.timezone || 'UTC',
          'meeting.meetingLink': meetingLink || setup.meeting.meetingLink,
          'meeting.calendarProvider': dto.calendarProvider || 'MANUAL',
          'meeting.calendarEventId': calendarEventId,
          'meeting.notes': dto.notes,
          'meeting.status': SetupMeetingStatus.SCHEDULED,
          status: SetupStatus.MEETING_SCHEDULED,
          updatedBy: user.id,
        },
      },
      user.organizationId,
    );

    await this.pushStatusHistory(
      id,
      SetupStatus.MEETING_SCHEDULED,
      user.id,
      'Setup meeting booked',
    );

    return this.toOrganizerView(updated!);
  }

  async updatePaymentStatus(
    id: string,
    user: RequestUser,
    dto: UpdateSetupPaymentDto,
  ) {
    const setup = await this.requireOwnedSetup(id, user);
    if (setup.status !== SetupStatus.PAYMENT_PENDING) {
      throw new BadRequestException(
        'Payment can only be confirmed while payment is pending',
      );
    }

    const paymentUpdate: Record<string, unknown> = {
      'payment.status': dto.status,
      'payment.provider': dto.provider,
      ...(dto.paymentIntentId
        ? { 'payment.paymentIntentId': dto.paymentIntentId }
        : {}),
      ...(dto.checkoutSessionId
        ? { 'payment.checkoutSessionId': dto.checkoutSessionId }
        : {}),
      ...(dto.amount !== undefined ? { 'payment.amount': dto.amount } : {}),
    };

    let nextStatus: SetupStatus = setup.status;
    if (dto.status === SetupPaymentStatus.PAID) {
      paymentUpdate['payment.paidAt'] = new Date();
      nextStatus = SetupStatus.PAYMENT_COMPLETED;
    }

    const updated = await this.repository.update(
      id,
      {
        $set: {
          ...paymentUpdate,
          status: nextStatus,
          updatedBy: user.id,
        },
      },
      user.organizationId,
    );

    if (nextStatus !== setup.status) {
      await this.pushStatusHistory(
        id,
        nextStatus,
        user.id,
        `Payment status updated to ${dto.status}`,
      );
    }

    return this.toOrganizerView(updated!);
  }

  async cancel(id: string, user: RequestUser) {
    const setup = await this.requireOwnedSetup(id, user);
    this.assertNotTerminal(setup.status);

    const updated = await this.repository.update(
      id,
      {
        $set: {
          status: SetupStatus.CANCELLED,
          cancelledAt: new Date(),
          updatedBy: user.id,
        },
      },
      user.organizationId,
    );

    await this.pushStatusHistory(
      id,
      SetupStatus.CANCELLED,
      user.id,
      'Setup cancelled by organizer',
    );

    return this.toOrganizerView(updated!);
  }

  async adminFindAll(query: OnboardingSetupQueryDto) {
    const [items, total] = await this.repository.findAll(query);
    return { items, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  async adminFindById(id: string) {
    const setup = await this.repository.findById(id);
    if (!setup) {
      throw new NotFoundException('Onboarding setup not found');
    }
    return setup;
  }

  async assignAdmin(id: string, admin: RequestUser, dto: AssignAdminDto) {
    const setup = await this.requireSetup(id);
    this.assertNotTerminal(setup.status);

    const updated = await this.repository.update(id, {
      $set: { assignedAdminId: dto.adminId, updatedBy: admin.id },
    });

    await this.pushStatusHistory(
      id,
      setup.status,
      admin.id,
      `Admin ${dto.adminId} assigned`,
    );

    return updated;
  }

  async addAdminNote(id: string, admin: RequestUser, dto: AddAdminNoteDto) {
    const setup = await this.requireSetup(id);
    this.assertNotTerminal(setup.status);

    const note: AdminNote = {
      adminId: admin.id,
      note: dto.note,
      createdAt: new Date(),
    };
    const updated = await this.repository.pushAdminNote(id, note);

    if (dto.statusNote) {
      await this.pushStatusHistory(id, setup.status, admin.id, dto.statusNote);
    }

    return updated;
  }

  async updateProgress(
    id: string,
    admin: RequestUser,
    dto: UpdateSetupProgressDto,
  ) {
    const setup = await this.requireSetup(id);
    this.assertNotTerminal(setup.status);

    const progress = setup.progress as OnboardingSetup['progress'];
    const sectionUpdates = this.buildProgressUpdates(dto, progress);

    let nextStatus = setup.status;
    const computed = SetupProgressHelper.computeOverallProgress({
      ...progress,
      ...sectionUpdates,
      overallProgress: progress.overallProgress,
    });

    if (
      SetupProgressHelper.isSetupComplete({
        ...progress,
        ...sectionUpdates,
        overallProgress: computed,
      })
    ) {
      nextStatus = SetupStatus.COMPLETED;
    }

    const updated = await this.repository.update(id, {
      $set: {
        ...sectionUpdates,
        'progress.overallProgress': computed,
        ...(nextStatus === SetupStatus.COMPLETED
          ? { status: SetupStatus.COMPLETED, completedAt: new Date() }
          : {}),
        updatedBy: admin.id,
      },
    });

    if (nextStatus !== setup.status) {
      await this.pushStatusHistory(
        id,
        SetupStatus.COMPLETED,
        admin.id,
        'Setup progress completed',
      );
    }

    return updated;
  }

  async changeStatus(
    id: string,
    admin: RequestUser,
    dto: ChangeSetupStatusDto,
  ) {
    const setup = await this.requireSetup(id);
    this.assertNotTerminal(setup.status);
    this.assertAllowedTransition(setup.status, dto.status);

    const sideEffects: Record<string, unknown> = {};
    if (dto.status === SetupStatus.COMPLETED) {
      sideEffects.completedAt = new Date();
    }
    if (dto.status === SetupStatus.CANCELLED) {
      sideEffects.cancelledAt = new Date();
    }

    const updated = await this.repository.update(id, {
      $set: { ...sideEffects, status: dto.status, updatedBy: admin.id },
    });

    await this.pushStatusHistory(id, dto.status, admin.id, dto.note);

    return updated;
  }

  async complete(id: string, admin: RequestUser) {
    return this.changeStatus(id, admin, { status: SetupStatus.COMPLETED });
  }

  private resolvePackageDefaults(dto: CreateOnboardingSetupDto) {
    switch (dto.packageType) {
      case PlanType.STARTER:
        return {
          setupType: SetupType.SELF_CONNECT,
          setupFeeType: SetupFeeType.FREE,
          status: SetupStatus.NOT_STARTED,
          payment: {
            required: false,
            status: SetupPaymentStatus.NOT_REQUIRED,
            amount: 0,
          },
          meeting: {
            isRequired: false,
            status: SetupMeetingStatus.NOT_REQUIRED,
          },
        };
      case PlanType.GROWTH:
        return {
          setupType: dto.setupType ?? SetupType.DONE_FOR_YOU,
          setupFeeType: SetupFeeType.PAID_ADDON,
          status: SetupStatus.PAYMENT_PENDING,
          payment: {
            required: true,
            status: SetupPaymentStatus.PENDING,
            amount: dto.setupPackagePrice ?? 0,
            currency: dto.setupPackageCurrency ?? 'USD',
          },
          meeting: { isRequired: true, status: SetupMeetingStatus.PENDING },
        };
      case PlanType.ENTERPRISE:
        return {
          setupType: SetupType.DONE_FOR_YOU,
          setupFeeType: SetupFeeType.INCLUDED_IN_PLAN,
          status: SetupStatus.MEETING_PENDING,
          payment: {
            required: false,
            status: SetupPaymentStatus.NOT_REQUIRED,
            amount: 0,
          },
          meeting: { isRequired: true, status: SetupMeetingStatus.PENDING },
        };
      default:
        throw new BadRequestException('Unsupported package type');
    }
  }

  private buildRequirementsUpdate(
    requirements: UpdateOnboardingSetupDto['requirements'],
  ): Record<string, unknown> {
    const update: Record<string, unknown> = {};
    if (!requirements) return update;

    const fields = [
      'businessName',
      'website',
      'industry',
      'teamSize',
      'message',
      'crmProvider',
      'calendarProvider',
      'callingProvider',
      'needCrmMigration',
      'needCalendarSetup',
      'needTwilioSetup',
      'needAiAgentSetup',
      'needWorkflowSetup',
      'needTeamOnboarding',
    ] as const;

    for (const field of fields) {
      const value = requirements[field];
      if (value !== undefined) {
        update[`requirements.${field}`] = value;
      }
    }

    return update;
  }

  private buildProgressUpdates(
    dto: UpdateSetupProgressDto,
    progress: OnboardingSetup['progress'],
  ): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    const sections = [
      'crmSetup',
      'calendarSetup',
      'twilioSetup',
      'aiAgentSetup',
      'workflowSetup',
      'teamOnboarding',
    ] as const;

    for (const key of sections) {
      const section = dto[key];
      if (!section) continue;

      const current = progress[key];
      const status = section.status ?? current.status;
      const note = section.note !== undefined ? section.note : current.note;
      const completedAt =
        status === IntegrationSetupStatus.COMPLETED
          ? current.completedAt ?? new Date()
          : undefined;

      updates[`progress.${key}.status`] = status;
      if (note !== undefined) {
        updates[`progress.${key}.note`] = note;
      }
      if (completedAt) {
        updates[`progress.${key}.completedAt`] = completedAt;
      } else {
        updates[`progress.${key}.completedAt`] = null;
      }
    }

    return updates;
  }

  private async requireOwnedSetup(id: string, user: RequestUser) {
    const setup = await this.repository.findById(id, user.organizationId);
    if (!setup) {
      throw new NotFoundException('Onboarding setup not found');
    }
    return setup;
  }

  private async requireSetup(id: string) {
    const setup = await this.repository.findById(id);
    if (!setup) {
      throw new NotFoundException('Onboarding setup not found');
    }
    return setup;
  }

  private async pushStatusHistory(
    id: string,
    status: SetupStatus,
    changedBy: string,
    note?: string,
  ) {
    const entry: StatusHistoryEntry = {
      status,
      changedBy,
      note,
      changedAt: new Date(),
    };
    await this.repository.pushStatusHistory(id, entry);
  }

  private assertNotTerminal(status: SetupStatus) {
    if (status === SetupStatus.COMPLETED || status === SetupStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot modify a setup that is ${status.toLowerCase()}`,
      );
    }
  }

  private assertAllowedTransition(from: SetupStatus, to: SetupStatus) {
    if (from === to) {
      throw new BadRequestException(`Setup is already ${from.toLowerCase()}`);
    }
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new ForbiddenException(
        `Cannot transition setup from ${from} to ${to}`,
      );
    }
  }

  private toOrganizerView(setup: OnboardingSetup & { _id: unknown }) {
    return {
      ...setup,
      statusMessage: STATUS_MESSAGES[setup.status],
    };
  }
}
