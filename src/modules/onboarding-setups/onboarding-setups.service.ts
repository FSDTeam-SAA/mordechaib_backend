import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendEmail } from '../../common/helpers/mailer.helper';
import {
  getOnboardingSetupMeetingTemplate,
  getOnboardingSetupOrganizerMeetingConfirmationTemplate,
} from '../../common/templates/onboarding-setup-meeting.template';
import {
  AdminNote,
  OnboardingSetup,
  StatusHistoryEntry,
} from '../../database/schemas/onboarding-setup.schema';
import { IntegrationSetupStatus } from '../../common/enums/integration-setup-status.enum';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { SetupPaymentStatus } from '../../common/enums/setup-payment-status.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { SetupPackagesService } from '../setup-packages/setup-packages.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { AddAdminNoteDto } from './dto/add-admin-note.dto';
import { AssignAdminDto } from './dto/assign-admin.dto';
import { BookSetupMeetingDto } from './dto/book-setup-meeting.dto';
import { ChangeSetupStatusDto } from './dto/change-setup-status.dto';
import { CreateOnboardingSetupDto } from './dto/create-onboarding-setup.dto';
import { CreateOnboardingPaymentSessionDto } from './dto/create-onboarding-payment-session.dto';
import { OnboardingSetupQueryDto } from './dto/onboarding-setup-query.dto';
import { UpdateOnboardingSetupDto } from './dto/update-onboarding-setup.dto';
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
  private readonly logger = new Logger(OnboardingSetupsService.name);

  constructor(
    private readonly repository: OnboardingSetupsRepository,
    private readonly stripeProvider: StripeProvider,
    private readonly config: ConfigService,
    private readonly setupPackagesService: SetupPackagesService,
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

    const selectedPackage = await this.setupPackagesService.findActiveById(
      dto.setupPackageId,
    );
    const defaults = this.resolvePackageDefaults(selectedPackage);
    const setup = await this.repository.create({
      organizationId: user.organizationId,
      organizerId: user.id,
      createdBy: user.id,
      ...defaults,
      setupPackageId: String(selectedPackage._id),
      selectedSetupPackage: this.buildSelectedPackage(selectedPackage),
      progress: this.buildInitialProgress(),
    });

    await this.pushStatusHistory(
      String(setup._id),
      setup.status,
      user.id,
      'Onboarding setup created',
    );

    if (setup.payment?.required) {
      const checkout = await this.createPaymentCheckoutSession(
        String(setup._id),
        user,
        {
          successUrl:
            dto.paymentSuccessUrl ||
            this.defaultPaymentSuccessUrl(String(setup._id)),
          cancelUrl:
            dto.paymentCancelUrl ||
            this.defaultPaymentCancelUrl(String(setup._id)),
        },
      );

      return {
        ...this.toOrganizerView(setup),
        ...(checkout.checkoutUrl ? { checkoutUrl: checkout.checkoutUrl } : {}),
      };
    }

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

    const shouldCollectRequirements =
      setup.setupType === SetupType.DONE_FOR_YOU &&
      setup.status === SetupStatus.MEETING_SCHEDULED &&
      Object.keys(requirementsUpdate).length > 0;
    const updated = await this.repository.update(
      id,
      {
        $set: {
          ...requirementsUpdate,
          ...(shouldCollectRequirements
            ? { status: SetupStatus.REQUIREMENT_COLLECTED }
            : {}),
          updatedBy: user.id,
        },
      },
      user.organizationId,
    );
    if (shouldCollectRequirements) {
      await this.pushStatusHistory(
        id,
        SetupStatus.REQUIREMENT_COLLECTED,
        user.id,
        'Company information submitted',
      );
    }
    return this.toOrganizerView(updated!);
  }

  async bookMeeting(id: string, user: RequestUser, dto: BookSetupMeetingDto) {
    const setup = await this.requireOwnedSetup(id, user);
    const recoverPaidMeetingState =
      setup.status === SetupStatus.MEETING_SCHEDULED &&
      setup.payment?.status === SetupPaymentStatus.PAID &&
      setup.meeting?.status === SetupMeetingStatus.PENDING;

    if (
      setup.status !== SetupStatus.MEETING_PENDING &&
      setup.status !== SetupStatus.PAYMENT_COMPLETED &&
      !recoverPaidMeetingState
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

    /*
     * Future platform-host automation (intentionally disabled):
     * This booking must use a Noltra platform onboarding-host connection,
     * not user.organizationId. When that host configuration exists, reuse
     * PlatformMeetingsService here to create Google Meet/Zoom, save its join
     * URL, and email it to the customer.
     */

    const nextStatus = this.hasSubmittedRequirements(setup)
      ? SetupStatus.REQUIREMENT_COLLECTED
      : SetupStatus.MEETING_SCHEDULED;
    const updated = await this.repository.update(
      id,
      {
        $set: {
          'meeting.meetingDate': start,
          'meeting.startTime': start,
          'meeting.endTime': end,
          'meeting.timezone': dto.timezone || setup.meeting.timezone || 'UTC',
          'meeting.meetingLink': setup.meeting?.meetingLink,
          'meeting.calendarProvider': setup.meeting?.calendarProvider || 'MANUAL',
          'meeting.calendarEventId': setup.meeting?.calendarEventId,
          'meeting.notes': dto.notes,
          'meeting.status': SetupMeetingStatus.SCHEDULED,
          status: nextStatus,
          updatedBy: user.id,
        },
      },
      user.organizationId,
    );

    await this.pushStatusHistory(
      id,
      nextStatus,
      user.id,
      recoverPaidMeetingState
        ? 'Setup meeting booked and inconsistent payment state repaired'
        : 'Setup meeting booked',
    );

    const scheduledMeetingLink =
      updated?.meeting?.meetingLink || setup.meeting?.meetingLink;
    await this.notifySupportTeamOfMeeting(
      setup,
      user,
      start,
      end,
      dto,
      scheduledMeetingLink,
    );
    await this.notifyOrganizerOfBookedMeeting(
      setup,
      user,
      start,
      end,
      dto,
      scheduledMeetingLink,
    );

    return this.toOrganizerView(updated!);
  }

  async createPaymentCheckoutSession(
    id: string,
    user: RequestUser,
    dto: CreateOnboardingPaymentSessionDto,
  ) {
    const setup = await this.requireOwnedSetup(id, user);
    if (!setup.payment?.required) {
      throw new BadRequestException(
        'Stripe payment is not required for this onboarding setup',
      );
    }
    if (setup.status !== SetupStatus.PAYMENT_PENDING) {
      throw new BadRequestException(
        'This onboarding setup is not waiting for payment',
      );
    }
    if (!setup.payment.amount || setup.payment.amount <= 0) {
      throw new BadRequestException(
        'A positive setup payment amount is required',
      );
    }

    const session = await this.stripeProvider.createOneTimeCheckoutSession({
      amount: setup.payment.amount,
      currency: setup.payment.currency || 'USD',
      productName:
        setup.selectedSetupPackage?.name || 'Enterprise onboarding setup',
      customerEmail: user.email,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      metadata: {
        onboardingSetupId: id,
        organizationId: user.organizationId,
      },
    });

    await this.repository.update(
      id,
      {
        $set: {
          'payment.provider': 'STRIPE',
          'payment.checkoutSessionId': session.id,
          updatedBy: user.id,
        },
      },
      user.organizationId,
    );

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async updateSelfConnectProgress(
    id: string,
    user: RequestUser,
    dto: UpdateSetupProgressDto,
  ) {
    const setup = await this.requireOwnedSetup(id, user);
    if (setup.setupType !== SetupType.SELF_CONNECT) {
      throw new BadRequestException(
        'Integration progress can only be updated for self-connect setups',
      );
    }
    return this.updateProgressRecord(
      id,
      user.id,
      setup,
      dto,
      user.organizationId,
    );
  }

  async confirmStripePayment(input: {
    setupId: string;
    checkoutSessionId: string;
    paymentIntentId?: string;
  }) {
    const setup = await this.requireSetup(input.setupId);
    if (setup.payment?.status === SetupPaymentStatus.PAID) {
      if (
        setup.status === SetupStatus.MEETING_SCHEDULED &&
        setup.meeting?.status === SetupMeetingStatus.PENDING
      ) {
        const repaired = await this.repository.update(input.setupId, {
          $set: { status: SetupStatus.PAYMENT_COMPLETED },
        });
        await this.pushStatusHistory(
          input.setupId,
          SetupStatus.PAYMENT_COMPLETED,
          'STRIPE_WEBHOOK',
          'Repaired payment-confirmed setup waiting for meeting booking',
        );
        return repaired;
      }
      return setup;
    }
    if (setup.payment?.provider !== 'STRIPE') {
      this.logger.warn(
        `Ignoring Stripe payment for setup ${input.setupId} without a Stripe provider`,
      );
      return setup;
    }

    const requirementsSubmitted = this.hasSubmittedRequirements(setup);
    const nextStatus =
      setup.meeting?.status === SetupMeetingStatus.SCHEDULED
        ? requirementsSubmitted
          ? SetupStatus.REQUIREMENT_COLLECTED
          : SetupStatus.MEETING_SCHEDULED
        : SetupStatus.PAYMENT_COMPLETED;
    const updated = await this.repository.update(input.setupId, {
      $set: {
        'payment.status': SetupPaymentStatus.PAID,
        'payment.paidAt': new Date(),
        'payment.checkoutSessionId': input.checkoutSessionId,
        ...(input.paymentIntentId
          ? { 'payment.paymentIntentId': input.paymentIntentId }
          : {}),
        status: nextStatus,
      },
    });

    await this.pushStatusHistory(
      input.setupId,
      nextStatus,
      'STRIPE_WEBHOOK',
      'Onboarding setup payment confirmed by Stripe',
    );
    return updated;
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

    return this.updateProgressRecord(id, admin.id, setup, dto);
  }

  private async updateProgressRecord(
    id: string,
    actorId: string,
    setup: OnboardingSetup & { _id: unknown },
    dto: UpdateSetupProgressDto,
    organizationId?: string,
  ) {
    const progress = this.ensureProgress(setup.progress);
    const { updates: sectionUpdates, progress: nextProgress } =
      this.buildProgressUpdates(dto, progress);

    let nextStatus = setup.status;
    const computed = SetupProgressHelper.computeOverallProgress({
      ...nextProgress,
      overallProgress: progress.overallProgress,
    });

    if (
      SetupProgressHelper.isSetupComplete({
        ...nextProgress,
        overallProgress: computed,
      })
    ) {
      nextStatus = SetupStatus.COMPLETED;
    }

    const updated = await this.repository.update(
      id,
      {
        $set: {
          ...sectionUpdates,
          'progress.overallProgress': computed,
          ...(nextStatus === SetupStatus.COMPLETED
            ? { status: SetupStatus.COMPLETED, completedAt: new Date() }
            : {}),
          updatedBy: actorId,
        },
      },
      organizationId,
    );

    if (nextStatus !== setup.status) {
      await this.pushStatusHistory(
        id,
        SetupStatus.COMPLETED,
        actorId,
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

  private resolvePackageDefaults(setupPackage: {
    setupType: SetupType;
    setupFeeType: SetupFeeType;
    price: number;
    currency: string;
    paymentRequired: boolean;
    meetingRequired: boolean;
  }) {
    return {
      setupType: setupPackage.setupType,
      setupFeeType: setupPackage.setupFeeType,
      status: setupPackage.paymentRequired
        ? SetupStatus.PAYMENT_PENDING
        : setupPackage.meetingRequired
          ? SetupStatus.MEETING_PENDING
          : SetupStatus.NOT_STARTED,
      payment: {
        required: setupPackage.paymentRequired,
        status: setupPackage.paymentRequired
          ? SetupPaymentStatus.PENDING
          : SetupPaymentStatus.NOT_REQUIRED,
        amount: setupPackage.price,
        currency: setupPackage.currency,
      },
      meeting: {
        isRequired: setupPackage.meetingRequired,
        status: setupPackage.meetingRequired
          ? SetupMeetingStatus.PENDING
          : SetupMeetingStatus.NOT_REQUIRED,
      },
    };
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

  private buildSelectedPackage(setupPackage: {
    code: string;
    name: string;
    price: number;
    currency: string;
    description?: string;
  }) {
    return {
      code: setupPackage.code,
      name: setupPackage.name,
      price: setupPackage.price,
      currency: setupPackage.currency,
      ...(setupPackage.description
        ? { description: setupPackage.description }
        : {}),
    };
  }

  private buildInitialProgress(): OnboardingSetup['progress'] {
    const pending = () => ({ status: IntegrationSetupStatus.PENDING });
    return {
      overallProgress: 0,
      crmSetup: pending(),
      calendarSetup: pending(),
      twilioSetup: pending(),
      aiAgentSetup: pending(),
      workflowSetup: pending(),
      teamOnboarding: pending(),
    } as OnboardingSetup['progress'];
  }

  private buildProgressUpdates(
    dto: UpdateSetupProgressDto,
    progress: OnboardingSetup['progress'],
  ): {
    updates: Record<string, unknown>;
    progress: OnboardingSetup['progress'];
  } {
    const updates: Record<string, unknown> = {};
    const nextProgress = { ...progress };
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
          ? (current.completedAt ?? new Date())
          : undefined;

      nextProgress[key] = { status, note, completedAt };

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

    return { updates, progress: nextProgress };
  }

  private ensureProgress(
    progress: OnboardingSetup['progress'] | undefined,
  ): OnboardingSetup['progress'] {
    return progress || this.buildInitialProgress();
  }

  private hasSubmittedRequirements(setup: OnboardingSetup) {
    return Boolean(
      setup.requirements &&
      Object.values(setup.requirements).some((value) => value !== undefined),
    );
  }

  private async notifySupportTeamOfMeeting(
    setup: OnboardingSetup & { _id: unknown },
    user: RequestUser,
    start: Date,
    end: Date,
    dto: BookSetupMeetingDto,
    meetingLink?: string,
  ) {
    const supportEmail = this.config.get<string>('mail.supportEmail');
    if (!supportEmail) {
      this.logger.warn(
        `Support notification skipped for setup ${String(setup._id)} because SUPPORT_EMAIL is not configured`,
      );
      return;
    }

    const template = getOnboardingSetupMeetingTemplate({
      organizerName: `${user.firstName} ${user.lastName}`.trim(),
      organizerEmail: user.email,
      organizationId: setup.organizationId,
      setupId: String(setup._id),
      packageType:
        setup.selectedSetupPackage?.name ||
        setup.packageType ||
        'Onboarding setup',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone: dto.timezone || setup.meeting?.timezone || 'UTC',
      meetingLink,
    });

    await sendEmail(this.config, { to: supportEmail, ...template });
  }

  private async notifyOrganizerOfBookedMeeting(
    setup: OnboardingSetup & { _id: unknown },
    user: RequestUser,
    start: Date,
    end: Date,
    dto: BookSetupMeetingDto,
    meetingLink?: string,
  ) {
    const template = getOnboardingSetupOrganizerMeetingConfirmationTemplate({
      organizerName: `${user.firstName} ${user.lastName}`.trim(),
      packageType:
        setup.selectedSetupPackage?.name ||
        setup.packageType ||
        'Onboarding setup',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone: dto.timezone || setup.meeting?.timezone || 'UTC',
      meetingLink,
      hasBookingNote: Boolean(dto.notes?.trim()),
    });

    const sent = await sendEmail(this.config, { to: user.email, ...template });
    if (!sent) {
      this.logger.warn(
        `Meeting confirmation email could not be sent for setup ${String(setup._id)}`,
      );
    }
  }

  private defaultPaymentSuccessUrl(id: string) {
    const frontendUrl = this.config
      .getOrThrow<string>('mail.frontendUrl')
      .replace(/\/$/, '');
    return `${frontendUrl}/onboarding-setups/${id}/payment/success`;
  }

  private defaultPaymentCancelUrl(id: string) {
    const frontendUrl = this.config
      .getOrThrow<string>('mail.frontendUrl')
      .replace(/\/$/, '');
    return `${frontendUrl}/onboarding-setups/${id}/payment/cancel`;
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
