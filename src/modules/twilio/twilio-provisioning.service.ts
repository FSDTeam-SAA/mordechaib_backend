import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { TwilioCountry } from '../../common/enums/twilio-country.enum';
import { TwilioProvisioningStatus } from '../../common/enums/twilio-provisioning-status.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { normalizePhoneNumber } from '../../common/helpers/phone.helper';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { ProvisionTwilioDto } from './dto/provision-twilio.dto';
import { SearchTwilioNumbersDto } from './dto/search-twilio-numbers.dto';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioAccountsRepository } from './twilio-accounts.repository';
import { TwilioEligibilityService } from './twilio-eligibility.service';
import { TwilioPhoneNumbersRepository } from './twilio-phone-numbers.repository';
import { TwilioProvisioningQueue } from './twilio-provisioning.queue';
import { TwilioSettingsService } from './twilio-settings.service';

const RUNNING_STATUSES = [
  TwilioProvisioningStatus.CREATING_SUBACCOUNT,
  TwilioProvisioningStatus.PURCHASING_NUMBER,
  TwilioProvisioningStatus.CONFIGURING_VOICE,
  TwilioProvisioningStatus.ACTIVATING,
];

const COUNTRY_PREFIX: Record<TwilioCountry, string> = {
  [TwilioCountry.US]: '+1',
  [TwilioCountry.GB]: '+44',
  [TwilioCountry.FR]: '+33',
};

@Injectable()
export class TwilioProvisioningService {
  private readonly logger = new Logger(TwilioProvisioningService.name);

  constructor(
    private readonly accounts: TwilioAccountsRepository,
    private readonly numbers: TwilioPhoneNumbersRepository,
    private readonly settings: TwilioSettingsService,
    private readonly eligibility: TwilioEligibilityService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly provider: TwilioProvider,
    private readonly queue: TwilioProvisioningQueue,
    private readonly config: ConfigService,
  ) {}

  async searchAvailableNumbers(
    organizationId: string,
    query: SearchTwilioNumbersDto,
  ) {
    await this.eligibility.assertCanUseCalling(organizationId);
    if (query.areaCode && query.country !== TwilioCountry.US) {
      throw new BadRequestException(
        'areaCode is supported only for United States searches',
      );
    }
    const items = await this.provider.searchAvailableLocalNumbers({
      country: query.country,
      areaCode: query.areaCode,
      contains: query.contains,
      locality: query.locality,
      region: query.region,
      limit: query.limit,
    });
    return { country: query.country, type: 'LOCAL', items };
  }

  async getConnection(organizationId: string) {
    const [account, number, setting] = await Promise.all([
      this.accounts.findByOrganization(organizationId),
      this.numbers.findActiveByOrganization(organizationId),
      this.settings.findActiveByOrganization(organizationId),
    ]);

    if (!account) {
      return setting
        ? {
            status: 'LEGACY_ACTIVE',
            phoneNumber: setting.twilioNumber,
            forwardingNumber: setting.forwardingNumber,
            isRecordingEnabled: setting.isRecordingEnabled,
          }
        : { status: 'NOT_CONFIGURED' };
    }

    return {
      operationId: account.operationId,
      status: account.provisioningStatus,
      subaccountSid: account.subaccountSid,
      selectedCountry: account.selectedCountry,
      selectedPhoneNumber: account.selectedPhoneNumber,
      phoneNumber: number?.phoneNumber,
      phoneNumberSid: number?.phoneNumberSid,
      capabilities: number?.capabilities,
      forwardingNumber: setting?.forwardingNumber ?? account.forwardingNumber,
      isRecordingEnabled:
        setting?.isRecordingEnabled ?? account.isRecordingEnabled,
      lastErrorCode: account.lastErrorCode,
      lastErrorMessage: account.lastErrorMessage,
      retryCount: account.retryCount,
      provisionedAt: account.provisionedAt,
      suspendedAt: account.suspendedAt,
      closedAt: account.closedAt,
      closureReason: account.closureReason,
      retentionExpiresAt: account.retentionExpiresAt,
    };
  }

  async startProvisioning(organizationId: string, input: ProvisionTwilioDto) {
    await this.eligibility.assertCanUseCalling(organizationId);
    this.assertNumberMatchesCountry(input.phoneNumber, input.country);
    if (input.phoneNumber === input.forwardingNumber) {
      throw new BadRequestException(
        'The forwarding number must be different from the Twilio number',
      );
    }

    const existing = await this.accounts.findByOrganization(organizationId);
    if (existing?.provisioningStatus === TwilioProvisioningStatus.ACTIVE) {
      throw new ConflictException(
        'This organization already has an active Twilio connection',
      );
    }
    if (existing?.provisioningStatus === TwilioProvisioningStatus.CLOSING) {
      throw new ConflictException('This Twilio connection is being closed');
    }
    if (existing && RUNNING_STATUSES.includes(existing.provisioningStatus)) {
      await this.queue.enqueueProvisioning(
        organizationId,
        existing.operationId,
      );
      return this.getConnection(organizationId);
    }

    const activeNumber = existing
      ? await this.numbers.findActiveByOrganization(organizationId)
      : null;
    if (activeNumber && activeNumber.phoneNumber !== input.phoneNumber) {
      throw new ConflictException(
        'A phone number was already purchased for this connection; retry with the same number',
      );
    }

    const organization = await this.organizations.findCurrent(organizationId);
    const operationId = crypto.randomUUID();
    const account = existing
      ? await this.accounts.prepareRetry(organizationId, {
          selectedCountry: input.country,
          selectedPhoneNumber: normalizePhoneNumber(input.phoneNumber),
          forwardingNumber: normalizePhoneNumber(input.forwardingNumber),
          isRecordingEnabled: input.isRecordingEnabled ?? true,
          operationId,
          restartClosedConnection:
            existing.provisioningStatus === TwilioProvisioningStatus.CLOSED,
        })
      : await this.accounts.createIfMissing({
          organizationId,
          friendlyName:
            `Noltra - ${organizationId} - ${organization.name}`.slice(0, 64),
          selectedCountry: input.country,
          selectedPhoneNumber: normalizePhoneNumber(input.phoneNumber),
          forwardingNumber: normalizePhoneNumber(input.forwardingNumber),
          isRecordingEnabled: input.isRecordingEnabled ?? true,
          operationId,
        });

    if (!account) throw new ConflictException('Unable to start provisioning');
    await this.queue.enqueueProvisioning(organizationId, account.operationId);
    return this.getConnection(organizationId);
  }

  async retryProvisioning(organizationId: string) {
    const account = await this.accounts.findByOrganization(organizationId);
    if (!account) throw new NotFoundException('Twilio connection not found');
    if (
      account.provisioningStatus === TwilioProvisioningStatus.FAILED &&
      account.closureReason
    ) {
      const operationId = crypto.randomUUID();
      await this.accounts.updateByOrganization(organizationId, {
        operationId,
        provisioningStatus: TwilioProvisioningStatus.CLOSING,
        lastAttemptAt: new Date(),
      });
      const delay = account.retentionExpiresAt
        ? Math.max(0, account.retentionExpiresAt.getTime() - Date.now())
        : 0;
      await this.queue.enqueueClosure(organizationId, operationId, delay);
      return this.getConnection(organizationId);
    }

    await this.eligibility.assertCanUseCalling(organizationId);
    if (
      ![
        TwilioProvisioningStatus.FAILED,
        TwilioProvisioningStatus.SUSPENDED,
      ].includes(account.provisioningStatus)
    ) {
      throw new ConflictException(
        'Only failed or suspended provisioning can be retried',
      );
    }
    const updated = await this.accounts.prepareRetry(organizationId, {
      operationId: crypto.randomUUID(),
    });
    if (!updated) throw new NotFoundException('Twilio connection not found');
    await this.queue.enqueueProvisioning(organizationId, updated.operationId);
    return this.getConnection(organizationId);
  }

  async updateForwardingNumber(
    organizationId: string,
    forwardingNumber: string,
  ) {
    const account = await this.requireActiveAccount(organizationId);
    const updated = await this.settings.updateForwardingNumber(
      organizationId,
      forwardingNumber,
    );
    await this.accounts.updateByOrganization(organizationId, {
      forwardingNumber: updated.forwardingNumber,
    });
    return {
      status: account.provisioningStatus,
      forwardingNumber: updated.forwardingNumber,
    };
  }

  async requestClosure(organizationId: string, confirmed: boolean) {
    if (!confirmed) {
      throw new BadRequestException(
        'Twilio connection closure is not confirmed',
      );
    }
    const account = await this.accounts.findByOrganization(organizationId);
    if (!account) {
      const legacy = await this.settings.deactivate(organizationId);
      if (!legacy) throw new NotFoundException('Twilio connection not found');
      return { status: TwilioProvisioningStatus.CLOSED };
    }
    if (account.provisioningStatus === TwilioProvisioningStatus.CLOSED) {
      return this.getConnection(organizationId);
    }
    if (account.provisioningStatus === TwilioProvisioningStatus.CLOSING) {
      await this.queue.enqueueClosure(organizationId, account.operationId);
      return this.getConnection(organizationId);
    }

    const operationId = crypto.randomUUID();
    const updated = await this.accounts.updateByOrganization(organizationId, {
      operationId,
      provisioningStatus: TwilioProvisioningStatus.CLOSING,
      closureReason: 'OWNER_REQUEST',
      lastAttemptAt: new Date(),
    });
    if (!updated) throw new NotFoundException('Twilio connection not found');
    await this.settings.deactivate(organizationId);
    await this.queue.enqueueClosure(organizationId, operationId);
    return this.getConnection(organizationId);
  }

  async processProvisioning(organizationId: string, operationId: string) {
    await this.eligibility.assertCanUseCalling(organizationId);
    let account =
      await this.accounts.findByOrganizationWithSecret(organizationId);
    if (!account) throw new NotFoundException('Twilio connection not found');
    if (account.operationId !== operationId) return;

    if (!account.subaccountSid || !account.authTokenEncrypted) {
      const claimed = await this.accounts.updateByOperation(
        organizationId,
        operationId,
        {
          provisioningStatus: TwilioProvisioningStatus.CREATING_SUBACCOUNT,
          lastAttemptAt: new Date(),
        },
      );
      if (!claimed) return;
      // Recover an account that Twilio created before a prior worker stopped
      // unexpectedly. The organization id in the friendly name makes this
      // lookup deterministic and avoids creating a paid duplicate.
      const created =
        (await this.provider.findSubaccountByFriendlyName(
          account.friendlyName,
        )) || (await this.provider.createSubaccount(account.friendlyName));
      const persisted = await this.accounts.updateByOperation(
        organizationId,
        operationId,
        {
          subaccountSid: created.sid,
          authTokenEncrypted: encryptText(
            created.authToken,
            this.encryptionKey,
          ),
          remoteStatus: created.status,
        },
      );
      if (!persisted) return;
      account =
        await this.accounts.findByOrganizationWithSecret(organizationId);
    }
    if (!account?.subaccountSid || !account.authTokenEncrypted) {
      throw new Error('Subaccount credentials were not persisted');
    }

    const context = {
      accountSid: account.subaccountSid,
      authToken: this.decryptAccountToken(account.authTokenEncrypted),
    };
    if (account.remoteStatus === 'suspended') {
      await this.provider.updateSubaccountStatus(
        account.subaccountSid,
        'active',
      );
      if (
        !(await this.accounts.updateByOperation(organizationId, operationId, {
          remoteStatus: 'active',
        }))
      ) {
        return;
      }
    }

    let number = await this.numbers.findActiveByOrganization(organizationId);
    if (!number) {
      if (
        !(await this.accounts.updateByOperation(organizationId, operationId, {
          provisioningStatus: TwilioProvisioningStatus.PURCHASING_NUMBER,
        }))
      ) {
        return;
      }
      const owned =
        (await this.provider.findOwnedPhoneNumber(
          context,
          account.selectedPhoneNumber,
        )) ||
        (await this.provider.purchasePhoneNumber(context, {
          phoneNumber: account.selectedPhoneNumber,
          friendlyName: account.friendlyName,
        }));
      number = await this.numbers.savePurchased({
        organizationId,
        subaccountSid: account.subaccountSid,
        phoneNumberSid: owned.sid,
        phoneNumber: owned.phoneNumber,
        country: account.selectedCountry,
        capabilities: owned.capabilities,
      });
    }

    const voiceUrl = this.webhookUrl('voice');
    if (number.voiceUrl !== voiceUrl) {
      if (
        !(await this.accounts.updateByOperation(organizationId, operationId, {
          provisioningStatus: TwilioProvisioningStatus.CONFIGURING_VOICE,
        }))
      ) {
        return;
      }
      await this.provider.configureVoiceWebhook(
        context,
        number.phoneNumberSid,
        voiceUrl,
      );
      number = await this.numbers.markVoiceConfigured(
        organizationId,
        number.phoneNumberSid,
        voiceUrl,
      );
    }

    await this.eligibility.assertCanUseCalling(organizationId);
    if (
      !(await this.accounts.updateByOperation(organizationId, operationId, {
        provisioningStatus: TwilioProvisioningStatus.ACTIVATING,
      }))
    ) {
      return;
    }
    await this.settings.activateProvisioned(organizationId, {
      twilioNumber: number!.phoneNumber,
      forwardingNumber: account.forwardingNumber,
      isRecordingEnabled: account.isRecordingEnabled,
    });
    await this.accounts.updateByOperation(
      organizationId,
      operationId,
      {
        provisioningStatus: TwilioProvisioningStatus.ACTIVE,
        remoteStatus: 'active',
        provisionedAt: new Date(),
      },
      { lastErrorCode: 1, lastErrorMessage: 1, suspendedAt: 1 },
    );
  }

  async processClosure(organizationId: string, operationId: string) {
    let account =
      await this.accounts.findByOrganizationWithSecret(organizationId);
    if (!account) return;
    if (account.operationId !== operationId) return;
    if (account.provisioningStatus === TwilioProvisioningStatus.CLOSED) return;

    if (!account.subaccountSid || !account.authTokenEncrypted) {
      const recovered = await this.provider.findSubaccountByFriendlyName(
        account.friendlyName,
      );
      if (recovered) {
        const persisted = await this.accounts.updateByOperation(
          organizationId,
          operationId,
          {
            subaccountSid: recovered.sid,
            authTokenEncrypted: encryptText(
              recovered.authToken,
              this.encryptionKey,
            ),
            remoteStatus: recovered.status,
          },
        );
        if (!persisted) return;
        account =
          await this.accounts.findByOrganizationWithSecret(organizationId);
        if (!account || account.operationId !== operationId) return;
      }
    }

    if (account.subaccountSid && account.authTokenEncrypted) {
      const context = {
        accountSid: account.subaccountSid,
        authToken: this.decryptAccountToken(account.authTokenEncrypted),
      };
      const number = await this.numbers.markReleasing(organizationId);
      if (number) {
        await this.provider.releasePhoneNumber(context, number.phoneNumberSid);
        await this.numbers.markReleased(organizationId, number.phoneNumberSid);
      }
      await this.provider.updateSubaccountStatus(
        account.subaccountSid,
        'closed',
      );
      await this.accounts.rememberClosedSubaccount(
        organizationId,
        account.subaccountSid,
        operationId,
      );
    }
    await this.settings.deactivate(organizationId);
    await this.accounts.updateByOperation(
      organizationId,
      operationId,
      {
        provisioningStatus: TwilioProvisioningStatus.CLOSED,
        remoteStatus: 'closed',
        closedAt: new Date(),
      },
      { authTokenEncrypted: 1, retentionExpiresAt: 1 },
    );
  }

  async markFailed(
    organizationId: string,
    operationId: string,
    error: unknown,
  ) {
    const account = await this.accounts.findByOrganization(organizationId);
    if (!account || account.operationId !== operationId) return;
    const message =
      error instanceof Error ? error.message : 'Twilio provisioning failed';
    await this.accounts.updateByOperation(organizationId, operationId, {
      provisioningStatus: TwilioProvisioningStatus.FAILED,
      lastErrorCode: this.errorCode(error),
      lastErrorMessage: message.slice(0, 500),
      lastAttemptAt: new Date(),
    });
  }

  async suspendForBilling(organizationId: string) {
    const account =
      await this.accounts.findByOrganizationWithSecret(organizationId);
    if (!account?.subaccountSid || account.remoteStatus !== 'active') return;
    await this.provider.updateSubaccountStatus(
      account.subaccountSid,
      'suspended',
    );
    await this.settings.deactivate(organizationId);
    await this.accounts.updateByOrganization(organizationId, {
      provisioningStatus: TwilioProvisioningStatus.SUSPENDED,
      remoteStatus: 'suspended',
      suspendedAt: new Date(),
    });
  }

  async resumeForBilling(organizationId: string) {
    const account =
      await this.accounts.findByOrganizationWithSecret(organizationId);
    if (
      !account?.subaccountSid ||
      !account.authTokenEncrypted ||
      account.provisioningStatus !== TwilioProvisioningStatus.SUSPENDED
    ) {
      return;
    }
    const number = await this.numbers.findActiveByOrganization(organizationId);
    if (!number) return;

    await this.provider.updateSubaccountStatus(account.subaccountSid, 'active');
    await this.settings.activateProvisioned(organizationId, {
      twilioNumber: number.phoneNumber,
      forwardingNumber: account.forwardingNumber,
      isRecordingEnabled: account.isRecordingEnabled,
    });
    await this.accounts.updateByOrganization(
      organizationId,
      {
        operationId: crypto.randomUUID(),
        provisioningStatus: TwilioProvisioningStatus.ACTIVE,
        remoteStatus: 'active',
      },
      {
        suspendedAt: 1,
        lastErrorCode: 1,
        lastErrorMessage: 1,
        closureReason: 1,
        retentionExpiresAt: 1,
      },
    );
  }

  async scheduleCancellationClosure(organizationId: string) {
    await this.suspendForBilling(organizationId);
    const account = await this.accounts.findByOrganization(organizationId);
    if (
      !account ||
      account.provisioningStatus === TwilioProvisioningStatus.CLOSED ||
      account.closureReason === 'OWNER_REQUEST'
    ) {
      return;
    }

    if (
      account.closureReason === 'SUBSCRIPTION_CANCELED' &&
      account.retentionExpiresAt
    ) {
      await this.queue.enqueueClosure(
        organizationId,
        account.operationId,
        Math.max(0, account.retentionExpiresAt.getTime() - Date.now()),
      );
      return;
    }

    const retentionDays = this.config.get<number>(
      'twilio.numberRetentionDays',
      30,
    );
    const retentionExpiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1_000,
    );
    const operationId = crypto.randomUUID();
    await this.accounts.updateByOrganization(organizationId, {
      operationId,
      provisioningStatus: TwilioProvisioningStatus.SUSPENDED,
      closureReason: 'SUBSCRIPTION_CANCELED',
      retentionExpiresAt,
    });
    await this.queue.enqueueClosure(
      organizationId,
      operationId,
      retentionExpiresAt.getTime() - Date.now(),
    );
    await this.notifyOwnerOfScheduledRelease(
      organizationId,
      retentionExpiresAt,
    );
  }

  private async requireActiveAccount(organizationId: string) {
    const account = await this.accounts.findByOrganization(organizationId);
    if (
      !account ||
      account.provisioningStatus !== TwilioProvisioningStatus.ACTIVE
    ) {
      throw new ConflictException('An active Twilio connection is required');
    }
    return account;
  }

  private assertNumberMatchesCountry(
    phoneNumberInput: string,
    country: TwilioCountry,
  ) {
    const phoneNumber = normalizePhoneNumber(phoneNumberInput);
    if (!phoneNumber.startsWith(COUNTRY_PREFIX[country])) {
      throw new BadRequestException(
        `phoneNumber does not belong to selected country ${country}`,
      );
    }
  }

  private webhookUrl(path: string) {
    const baseUrl = this.config.getOrThrow<string>('APP_BASE_URL');
    return `${baseUrl.replace(/\/+$/, '')}/api/v1/webhooks/twilio/${path}`;
  }

  private decryptAccountToken(encrypted: string) {
    return decryptText(encrypted, this.encryptionKey);
  }

  private get encryptionKey() {
    return this.config.getOrThrow<string>('integrations.encryptionKey');
  }

  private errorCode(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (typeof error.code === 'string' || typeof error.code === 'number')
    ) {
      return String(error.code);
    }
    return 'TWILIO_PROVISIONING_FAILED';
  }

  private async notifyOwnerOfScheduledRelease(
    organizationId: string,
    retentionExpiresAt: Date,
  ) {
    try {
      const users = await this.users.findByOrganization(organizationId);
      const owner = users.find((user) => user.role === UserRole.OWNER);
      if (!owner) return;
      const releaseDate = retentionExpiresAt.toISOString();
      await sendEmail(this.config, {
        to: owner.email,
        subject: 'Your business phone number is scheduled for release',
        text:
          'Your subscription has ended and the Twilio connection is suspended. ' +
          `The business number will be released after ${releaseDate} unless the subscription is restored before then.`,
      });
    } catch (error) {
      // Provisioning state is authoritative; an email problem must not prevent
      // the retention job from being scheduled.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to notify owner of Twilio number retention for ${organizationId}: ${message}`,
      );
    }
  }
}
