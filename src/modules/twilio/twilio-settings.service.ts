import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isE164,
  normalizePhoneNumber,
} from '../../common/helpers/phone.helper';
import { TwilioSettingStatus } from '../../common/enums/twilio-setting-status.enum';
import { SaveTwilioSettingsDto } from './dto/save-twilio-settings.dto';
import { TwilioSettingsRepository } from './twilio-settings.repository';
import { TwilioAccountsRepository } from './twilio-accounts.repository';

@Injectable()
export class TwilioSettingsService {
  constructor(
    private readonly repository: TwilioSettingsRepository,
    private readonly accounts: TwilioAccountsRepository,
  ) {}

  async save(organizationId: string, input: SaveTwilioSettingsDto) {
    const managedAccount =
      await this.accounts.findByOrganization(organizationId);
    if (managedAccount) {
      throw new ConflictException(
        'Managed Twilio connections must be changed through the connection endpoints',
      );
    }
    return this.persist(organizationId, input);
  }

  private async persist(organizationId: string, input: SaveTwilioSettingsDto) {
    const twilioNumber = normalizePhoneNumber(input.twilioNumber);
    const forwardingNumber = normalizePhoneNumber(input.forwardingNumber);

    if (!isE164(twilioNumber) || !isE164(forwardingNumber)) {
      throw new BadRequestException('Phone numbers must use E.164 format');
    }

    if (twilioNumber === forwardingNumber) {
      throw new BadRequestException(
        'The forwarding number must be different from the Twilio number',
      );
    }

    const existing = await this.repository.findByTwilioNumber(twilioNumber);
    if (existing && existing.organizationId !== organizationId) {
      throw new ConflictException(
        'This Twilio number belongs to another organization',
      );
    }

    try {
      return await this.repository.upsert(organizationId, {
        twilioNumber,
        forwardingNumber,
        isRecordingEnabled: input.isRecordingEnabled ?? true,
        status: input.status ?? TwilioSettingStatus.ACTIVE,
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException(
          'This Twilio number belongs to another organization',
        );
      }
      throw error;
    }
  }

  findActiveByTwilioNumber(twilioNumber: string) {
    return this.repository.findActiveByTwilioNumber(
      normalizePhoneNumber(twilioNumber),
    );
  }

  findActiveByOrganization(organizationId: string) {
    return this.repository.findActiveByOrganization(organizationId);
  }

  activateProvisioned(
    organizationId: string,
    input: {
      twilioNumber: string;
      forwardingNumber: string;
      isRecordingEnabled: boolean;
    },
  ) {
    return this.persist(organizationId, {
      ...input,
      status: TwilioSettingStatus.ACTIVE,
    });
  }

  async updateForwardingNumber(
    organizationId: string,
    forwardingNumberInput: string,
  ) {
    const forwardingNumber = normalizePhoneNumber(forwardingNumberInput);
    if (!isE164(forwardingNumber)) {
      throw new BadRequestException('Phone numbers must use E.164 format');
    }
    const current =
      await this.repository.findActiveByOrganization(organizationId);
    if (!current) throw new NotFoundException('Twilio connection not found');
    if (current.twilioNumber === forwardingNumber) {
      throw new BadRequestException(
        'The forwarding number must be different from the Twilio number',
      );
    }
    const updated = await this.repository.updateForwardingNumber(
      organizationId,
      forwardingNumber,
    );
    if (!updated) throw new NotFoundException('Twilio connection not found');
    return updated;
  }

  deactivate(organizationId: string) {
    return this.repository.deactivate(organizationId);
  }
}
