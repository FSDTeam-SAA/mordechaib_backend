import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptText } from '../../common/helpers/crypto.helper';
import { TwilioAccountContext } from './providers/twilio.provider';
import { TwilioAccountsRepository } from './twilio-accounts.repository';

@Injectable()
export class TwilioAccountsService {
  constructor(
    private readonly repository: TwilioAccountsRepository,
    private readonly config: ConfigService,
  ) {}

  async contextForOrganization(
    organizationId: string,
  ): Promise<TwilioAccountContext | undefined> {
    const account =
      await this.repository.findByOrganizationWithSecret(organizationId);
    return this.toContext(account);
  }

  async contextForSubaccount(
    subaccountSid: string,
  ): Promise<TwilioAccountContext | undefined> {
    const account =
      await this.repository.findBySubaccountSidWithSecret(subaccountSid);
    return this.toContext(account);
  }

  private toContext(
    account:
      | { subaccountSid?: string; authTokenEncrypted?: string }
      | null
      | undefined,
  ): TwilioAccountContext | undefined {
    if (!account?.subaccountSid || !account.authTokenEncrypted)
      return undefined;
    return {
      accountSid: account.subaccountSid,
      authToken: decryptText(account.authTokenEncrypted, this.encryptionKey),
    };
  }

  private get encryptionKey() {
    return this.config.getOrThrow<string>('integrations.encryptionKey');
  }
}
