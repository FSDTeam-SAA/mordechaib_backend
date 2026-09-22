import {
  BadRequestException,
  ConflictException,
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
import { CreateOnboardingSetupDto } from './dto/create-onboarding-setup.dto';
import { CreateOnboardingPaymentSessionDto } from './dto/create-onboarding-payment-session.dto';
import { OnboardingSetupQueryDto } from './dto/onboarding-setup-query.dto';
import { OnboardingAvailableSlotsQueryDto } from './dto/onboarding-available-slots-query.dto';
import { UpsertOnboardingAvailabilityDto } from './dto/upsert-onboarding-availability.dto';
import { OnboardingAvailabilityService } from './onboarding-availability.service';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';

const STATUS_MESSAGES: Partial<Record<SetupStatus, string>> = {
  [SetupStatus.NOT_STARTED]: 'Setup has not started yet',
  [SetupStatus.PAYMENT_PENDING]: 'Complete payment to continue',
  [SetupStatus.PAYMENT_COMPLETED]: 'Payment complete—book your onboarding call',
  [SetupStatus.MEETING_PENDING]: 'Book your onboarding call',
  [SetupStatus.MEETING_SCHEDULED]: 'Your setup call is scheduled',
  [SetupStatus.COMPLETED]: 'Your onboarding call is complete',
  [SetupStatus.CANCELLED]: 'Setup was cancelled',
};

@Injectable()
export class OnboardingSetupsService {
  private readonly logger = new Logger(OnboardingSetupsService.name);

  constructor(
    private readonly repository: OnboardingSetupsRepository,
    private readonly stripeProvider: StripeProvider,
    private readonly config: ConfigService,
    private readonly setupPackagesService: SetupPackagesService,
    private readonly availabilityService: OnboardingAvailabilityService,
  ) {}

  async create(user: RequestUser, dto: CreateOnboardingSetupDto) {
    const existing = await this.repository.findActiveByOrganization(
      user.organizationId,
    );
    if (existing) {
      if (this.canRetryPayment(existing)) {
        const checkout = await this.createPaymentCheckoutSession(
          String(existing._id),
          user,
          {
            successUrl:
              dto.paymentSuccessUrl ||
              this.defaultPaymentSuccessUrl(String(existing._id)),
            cancelUrl:
              dto.paymentCancelUrl ||
              this.defaultPaymentCancelUrl(String(existing._id)),
          },
        );
        return {
          ...this.toOnboardingView(existing),
          checkoutUrl: checkout.checkoutUrl,
          sessionId: checkout.sessionId,
          resumedPayment: true,
        };
      }
      throw new ConflictException(
        'An active onboarding setup already exists for this organization',
      );
    }

    const selectedPackage = await this.setupPackagesService.findActiveById(
      dto.setupPackageId,
    );
    if (!selectedPackage.paymentRequired && !selectedPackage.meetingRequired) {
      throw new BadRequestException(
        'This package does not require onboarding payment or a meeting; continue to Connections',
      );
    }
    const defaults = this.resolvePackageDefaults(selectedPackage);
    const setup = await this.repository.create({
      organizationId: user.organizationId,
      organizerId: user.id,
      createdBy: user.id,
      ...defaults,
      setupPackageId: String(selectedPackage._id),
      selectedSetupPackage: this.buildSelectedPackage(selectedPackage),
    });

    if (setup.payment?.required) {
      let checkout: { checkoutUrl?: string | null; sessionId: string };
      try {
        await this.pushStatusHistory(
          String(setup._id),
          setup.status,
          user.id,
          'Onboarding setup created',
        );
        checkout = await this.createPaymentCheckoutSession(
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
      } catch (error) {
        await this.rollbackFailedPaidSetupCreation(
          String(setup._id),
          user.organizationId,
        );
        throw error;
      }

      return {
        ...this.toOnboardingView(setup),
        ...(checkout.checkoutUrl ? { checkoutUrl: checkout.checkoutUrl } : {}),
      };
    }

    await this.pushStatusHistory(
      String(setup._id),
      setup.status,
      user.id,
      'Onboarding setup created',
    );

    return this.toOnboardingView(setup);
  }

  async findMy(user: RequestUser) {
    const setup = await this.repository.findActiveByOrganization(
      user.organizationId,
    );
    if (!setup) {
      throw new NotFoundException('No onboarding setup found');
    }
    return this.toOnboardingView(setup);
  }

  getAvailability() {
    return this.availabilityService.getPublicAvailability();
  }

  async findById(id: string, user: RequestUser) {
    const setup = await this.repository.findById(id, user.organizationId);
    if (!setup) {
      throw new NotFoundException('Onboarding setup not found');
    }
    return this.toOnboardingView(setup);
  }

  async getAvailableSlots(
    id: string,
    user: RequestUser,
    query: OnboardingAvailableSlotsQueryDto,
  ) {
    const setup = await this.requireOwnedSetup(id, user);
    if (!setup.meeting?.isRequired) {
      throw new BadRequestException('This setup does not require a meeting');
    }
    const recoverPaidMeetingState =
      setup.status === SetupStatus.MEETING_SCHEDULED &&
      setup.payment?.status === SetupPaymentStatus.PAID &&
      setup.meeting.status === SetupMeetingStatus.PENDING;
    if (
      ![SetupStatus.MEETING_PENDING, SetupStatus.PAYMENT_COMPLETED].includes(
        setup.status,
      ) &&
      !recoverPaidMeetingState
    ) {
      throw new BadRequestException(
        'Meeting slots are only available when meeting booking is pending',
      );
    }
    return this.availabilityService.getAvailableSlots(query, id);
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
    const resolvedSlot = await this.availabilityService.resolveBookableSlot(
      dto.startTime,
      dto.endTime,
      id,
    );
    const { start, end, timezone } = resolvedSlot;

    /*
     * Future platform-host automation (intentionally disabled):
     * This booking must use a Noltra platform onboarding-host connection,
     * not user.organizationId. When that host configuration exists, reuse
     * PlatformMeetingsService here to create Google Meet/Zoom, save its join
     * URL, and email it to the customer.
     */

    const nextStatus = SetupStatus.MEETING_SCHEDULED;
    let updated: (OnboardingSetup & { _id: unknown }) | null;
    try {
      updated = await this.repository.bookMeetingIfPending(
        id,
        user.organizationId,
        {
          $set: {
            'meeting.meetingDate': start,
            'meeting.startTime': start,
            'meeting.endTime': end,
            'meeting.timezone': timezone,
            'meeting.meetingLink': setup.meeting?.meetingLink,
            'meeting.calendarProvider':
              setup.meeting?.calendarProvider || 'MANUAL',
            'meeting.calendarEventId': setup.meeting?.calendarEventId,
            'meeting.notes': dto.notes,
            'meeting.status': SetupMeetingStatus.SCHEDULED,
            status: nextStatus,
            updatedBy: user.id,
          },
        },
      );
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'This onboarding meeting slot was just booked; choose another slot',
        );
      }
      throw error;
    }
    if (!updated) {
      throw new ConflictException(
        'The onboarding setup changed while booking; refresh and try again',
      );
    }

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

    return this.toOnboardingView(updated);
  }

  getAdminAvailability() {
    return this.availabilityService.getAdminAvailability();
  }

  upsertAdminAvailability(
    dto: UpsertOnboardingAvailabilityDto,
    admin: RequestUser,
  ) {
    return this.availabilityService.upsertAdminAvailability(dto, admin);
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
          'payment.status': SetupPaymentStatus.PENDING,
          'payment.checkoutSessionId': session.id,
          updatedBy: user.id,
        },
        $unset: {
          'payment.failedAt': 1,
          'payment.failureCode': 1,
        },
      },
      user.organizationId,
    );

    return { checkoutUrl: session.url, sessionId: session.id };
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

    const nextStatus =
      setup.meeting?.status === SetupMeetingStatus.SCHEDULED
        ? SetupStatus.MEETING_SCHEDULED
        : setup.meeting?.isRequired
          ? SetupStatus.PAYMENT_COMPLETED
          : SetupStatus.COMPLETED;
    const updated = await this.repository.update(input.setupId, {
      $set: {
        'payment.status': SetupPaymentStatus.PAID,
        'payment.paidAt': new Date(),
        'payment.checkoutSessionId': input.checkoutSessionId,
        ...(input.paymentIntentId
          ? { 'payment.paymentIntentId': input.paymentIntentId }
          : {}),
        status: nextStatus,
        ...(nextStatus === SetupStatus.COMPLETED
          ? { completedAt: new Date() }
          : {}),
      },
      $unset: {
        'payment.failedAt': 1,
        'payment.failureCode': 1,
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

  async markStripePaymentFailed(input: {
    setupId: string;
    checkoutSessionId?: string;
    paymentIntentId?: string;
    failureCode?: string;
  }) {
    const setup = await this.requireSetup(input.setupId);
    if (
      setup.payment?.provider !== 'STRIPE' ||
      setup.payment.status === SetupPaymentStatus.PAID ||
      setup.status !== SetupStatus.PAYMENT_PENDING
    ) {
      return setup;
    }

    const updated = await this.repository.update(input.setupId, {
      $set: {
        'payment.status': SetupPaymentStatus.FAILED,
        'payment.failedAt': new Date(),
        ...(input.checkoutSessionId
          ? { 'payment.checkoutSessionId': input.checkoutSessionId }
          : {}),
        ...(input.paymentIntentId
          ? { 'payment.paymentIntentId': input.paymentIntentId }
          : {}),
        ...(input.failureCode
          ? { 'payment.failureCode': input.failureCode.slice(0, 200) }
          : {}),
      },
    });
    await this.pushStatusHistory(
      input.setupId,
      SetupStatus.PAYMENT_PENDING,
      'STRIPE_WEBHOOK',
      `Onboarding payment failed${input.failureCode ? `: ${input.failureCode}` : ''}; payment can be retried`,
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
          ...(setup.meeting?.isRequired
            ? { 'meeting.status': SetupMeetingStatus.CANCELLED }
            : {}),
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

    return this.toOnboardingView(updated!);
  }

  async adminFindAll(query: OnboardingSetupQueryDto) {
    const [items, total] = await this.repository.findAll(query);
    return {
      items: items.map((item) => this.toOnboardingView(item)),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async adminFindById(id: string) {
    const setup = await this.repository.findById(id);
    if (!setup) {
      throw new NotFoundException('Onboarding setup not found');
    }
    return this.toOnboardingView(setup);
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

    return this.toOnboardingView(updated!);
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

    return this.toOnboardingView(updated!);
  }

  async complete(id: string, admin: RequestUser) {
    const setup = await this.requireSetup(id);
    this.assertNotTerminal(setup.status);
    if (
      setup.payment?.required &&
      setup.payment.status !== SetupPaymentStatus.PAID
    ) {
      throw new BadRequestException(
        'Onboarding cannot be completed before payment succeeds',
      );
    }
    if (
      setup.meeting?.isRequired &&
      setup.meeting.status !== SetupMeetingStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Onboarding cannot be completed before the first meeting is scheduled',
      );
    }

    const updated = await this.repository.update(id, {
      $set: {
        status: SetupStatus.COMPLETED,
        completedAt: new Date(),
        ...(setup.meeting?.isRequired
          ? { 'meeting.status': SetupMeetingStatus.COMPLETED }
          : {}),
        updatedBy: admin.id,
      },
    });

    await this.pushStatusHistory(
      id,
      SetupStatus.COMPLETED,
      admin.id,
      'First onboarding meeting completed',
    );

    return this.toOnboardingView(updated!);
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

  private canRetryPayment(setup: OnboardingSetup) {
    return (
      setup.status === SetupStatus.PAYMENT_PENDING &&
      setup.payment?.required === true &&
      [SetupPaymentStatus.PENDING, SetupPaymentStatus.FAILED].includes(
        setup.payment.status,
      )
    );
  }

  private async rollbackFailedPaidSetupCreation(
    id: string,
    organizationId: string,
  ) {
    try {
      if (await this.repository.deleteById(id, organizationId)) return;
    } catch (error) {
      this.logger.error(
        `Could not delete setup ${id} after checkout creation failed: ${this.errorMessage(error)}`,
      );
    }

    // A failed hard-delete must never leave an active setup that blocks the
    // organizer. Mark it terminal so a later POST can start a new setup.
    await this.repository
      .update(id, {
        $set: {
          status: SetupStatus.CANCELLED,
          cancelledAt: new Date(),
          'payment.status': SetupPaymentStatus.FAILED,
          'payment.failedAt': new Date(),
          'payment.failureCode': 'CHECKOUT_SESSION_CREATION_FAILED',
        },
      }, organizationId)
      .catch((error: unknown) => {
        this.logger.error(
          `Could not mark setup ${id} as cancelled after checkout creation failed: ${this.errorMessage(error)}`,
        );
      });
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

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error)).slice(
      0,
      500,
    );
  }

  private isDuplicateKeyError(error: unknown) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000,
    );
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

  private toOnboardingView(setup: OnboardingSetup & { _id: unknown }) {
    const document = setup as OnboardingSetup & {
      _id: unknown;
      toObject?: () => Record<string, unknown>;
    };
    const view = document.toObject
      ? document.toObject()
      : ({ ...setup } as Record<string, unknown>);

    // Existing values are left in MongoDB for backward compatibility. The
    // focused onboarding API no longer exposes integration-owned data.
    delete view.requirements;
    delete view.progress;

    return {
      ...view,
      statusMessage:
        STATUS_MESSAGES[setup.status] || 'Onboarding status is available',
    };
  }
}
