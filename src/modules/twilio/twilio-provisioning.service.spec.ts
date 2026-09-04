import { ConfigService } from '@nestjs/config';
import { TwilioCountry } from '../../common/enums/twilio-country.enum';
import { TwilioProvisioningStatus } from '../../common/enums/twilio-provisioning-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioAccountsRepository } from './twilio-accounts.repository';
import { TwilioEligibilityService } from './twilio-eligibility.service';
import { TwilioPhoneNumbersRepository } from './twilio-phone-numbers.repository';
import { TwilioProvisioningQueue } from './twilio-provisioning.queue';
import { TwilioProvisioningService } from './twilio-provisioning.service';
import { TwilioSettingsService } from './twilio-settings.service';
import { UsersService } from '../users/users.service';

describe('TwilioProvisioningService', () => {
  let accounts: Record<string, jest.Mock>;
  let numbers: Record<string, jest.Mock>;
  let settings: Record<string, jest.Mock>;
  let provider: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let service: TwilioProvisioningService;

  beforeEach(() => {
    accounts = {
      findByOrganization: jest.fn(),
      findByOrganizationWithSecret: jest.fn(),
      createIfMissing: jest.fn(),
      prepareRetry: jest.fn(),
      updateByOrganization: jest.fn(),
      updateByOperation: jest
        .fn()
        .mockResolvedValue({ operationId: 'operation-1' }),
      rememberClosedSubaccount: jest.fn(),
    };
    numbers = {
      findActiveByOrganization: jest.fn(),
      savePurchased: jest.fn(),
      markVoiceConfigured: jest.fn(),
      markReleasing: jest.fn(),
      markReleased: jest.fn(),
    };
    settings = {
      findActiveByOrganization: jest.fn(),
      activateProvisioned: jest.fn(),
      updateForwardingNumber: jest.fn(),
      deactivate: jest.fn(),
    };
    provider = {
      searchAvailableLocalNumbers: jest.fn(),
      createSubaccount: jest.fn(),
      findSubaccountByFriendlyName: jest.fn(),
      findOwnedPhoneNumber: jest.fn(),
      purchasePhoneNumber: jest.fn(),
      configureVoiceWebhook: jest.fn(),
      updateSubaccountStatus: jest.fn(),
      releasePhoneNumber: jest.fn(),
    };
    queue = {
      enqueueProvisioning: jest.fn(),
      enqueueClosure: jest.fn(),
    };
    const eligibility = { assertCanUseCalling: jest.fn() };
    const organizations = {
      findCurrent: jest.fn().mockResolvedValue({ name: 'Acme' }),
    };
    const users = { findByOrganization: jest.fn().mockResolvedValue([]) };
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'APP_BASE_URL' ? 'https://api.example.com' : 'x'.repeat(32),
      ),
    };

    service = new TwilioProvisioningService(
      accounts as unknown as TwilioAccountsRepository,
      numbers as unknown as TwilioPhoneNumbersRepository,
      settings as unknown as TwilioSettingsService,
      eligibility as unknown as TwilioEligibilityService,
      organizations as unknown as OrganizationsService,
      users as unknown as UsersService,
      provider as unknown as TwilioProvider,
      queue as unknown as TwilioProvisioningQueue,
      config as unknown as ConfigService,
    );
  });

  it('creates one provisioning operation and queues it', async () => {
    accounts.findByOrganization
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        operationId: 'operation-1',
        provisioningStatus: TwilioProvisioningStatus.CREATING_SUBACCOUNT,
        selectedCountry: TwilioCountry.GB,
        selectedPhoneNumber: '+442079461001',
        forwardingNumber: '+442079461999',
        isRecordingEnabled: true,
      });
    accounts.createIfMissing.mockResolvedValue({
      operationId: 'operation-1',
    });
    numbers.findActiveByOrganization.mockResolvedValue(null);
    settings.findActiveByOrganization.mockResolvedValue(null);

    await service.startProvisioning('org-1', {
      country: TwilioCountry.GB,
      phoneNumber: '+442079461001',
      forwardingNumber: '+442079461999',
    });

    expect(accounts.createIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        selectedCountry: TwilioCountry.GB,
        selectedPhoneNumber: '+442079461001',
      }),
    );
    expect(queue.enqueueProvisioning).toHaveBeenCalledWith(
      'org-1',
      'operation-1',
    );
  });

  it('returns an existing running operation instead of creating a duplicate', async () => {
    const running = {
      operationId: 'operation-existing',
      provisioningStatus: TwilioProvisioningStatus.PURCHASING_NUMBER,
      selectedCountry: TwilioCountry.US,
      selectedPhoneNumber: '+14155551000',
      forwardingNumber: '+14155551999',
      isRecordingEnabled: true,
    };
    accounts.findByOrganization.mockResolvedValue(running);
    numbers.findActiveByOrganization.mockResolvedValue(null);
    settings.findActiveByOrganization.mockResolvedValue(null);

    const result = await service.startProvisioning('org-1', {
      country: TwilioCountry.US,
      phoneNumber: '+14155551000',
      forwardingNumber: '+14155551999',
    });

    expect(accounts.createIfMissing).not.toHaveBeenCalled();
    expect(provider.createSubaccount).not.toHaveBeenCalled();
    expect(queue.enqueueProvisioning).toHaveBeenCalledWith(
      'org-1',
      'operation-existing',
    );
    expect(result).toEqual(
      expect.objectContaining({ status: running.provisioningStatus }),
    );
  });

  it('rejects a number that does not belong to the selected country', async () => {
    await expect(
      service.startProvisioning('org-1', {
        country: TwilioCountry.FR,
        phoneNumber: '+14155551000',
        forwardingNumber: '+33189711001',
      }),
    ).rejects.toThrow('phoneNumber does not belong to selected country FR');
  });

  it('recovers an already-owned number instead of purchasing it again', async () => {
    const account = {
      organizationId: 'org-1',
      operationId: 'operation-1',
      friendlyName: 'Noltra - Acme',
      selectedCountry: TwilioCountry.FR,
      selectedPhoneNumber: '+33189711001',
      forwardingNumber: '+33189711999',
      isRecordingEnabled: true,
      provisioningStatus: TwilioProvisioningStatus.PURCHASING_NUMBER,
      subaccountSid: `AC${'1'.repeat(32)}`,
      authTokenEncrypted: Buffer.alloc(60).toString('base64'),
      remoteStatus: 'active',
    };
    accounts.findByOrganizationWithSecret.mockResolvedValue(account);
    numbers.findActiveByOrganization.mockResolvedValue(null);
    provider.findOwnedPhoneNumber.mockResolvedValue({
      sid: `PN${'2'.repeat(32)}`,
      phoneNumber: account.selectedPhoneNumber,
      capabilities: { voice: true, sms: false, mms: false },
    });
    numbers.savePurchased.mockResolvedValue({
      phoneNumberSid: `PN${'2'.repeat(32)}`,
      phoneNumber: account.selectedPhoneNumber,
      voiceUrl: undefined,
    });
    numbers.markVoiceConfigured.mockResolvedValue({
      phoneNumberSid: `PN${'2'.repeat(32)}`,
      phoneNumber: account.selectedPhoneNumber,
      voiceUrl: 'https://api.example.com/api/v1/webhooks/twilio/voice',
    });

    // The token is intentionally invalid ciphertext; bypass decryption for
    // this state-machine test by supplying a valid encrypted token.
    const cryptoHelper = await import('../../common/helpers/crypto.helper');
    account.authTokenEncrypted = cryptoHelper.encryptText(
      'subaccount-token',
      'x'.repeat(32),
    );

    await service.processProvisioning('org-1', 'operation-1');

    expect(provider.purchasePhoneNumber).not.toHaveBeenCalled();
    expect(provider.configureVoiceWebhook).toHaveBeenCalled();
    expect(settings.activateProvisioned).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ twilioNumber: account.selectedPhoneNumber }),
    );
  });

  it('recovers a subaccount created before a worker interruption', async () => {
    const cryptoHelper = await import('../../common/helpers/crypto.helper');
    const baseAccount = {
      organizationId: 'org-1',
      operationId: 'operation-1',
      friendlyName: 'Noltra - Acme - org-1',
      selectedCountry: TwilioCountry.US,
      selectedPhoneNumber: '+14155551001',
      forwardingNumber: '+14155551999',
      isRecordingEnabled: true,
      provisioningStatus: TwilioProvisioningStatus.CREATING_SUBACCOUNT,
    };
    const recoveredAccount = {
      ...baseAccount,
      subaccountSid: `AC${'3'.repeat(32)}`,
      authTokenEncrypted: cryptoHelper.encryptText(
        'subaccount-token',
        'x'.repeat(32),
      ),
      remoteStatus: 'active',
    };
    accounts.findByOrganizationWithSecret
      .mockResolvedValueOnce(baseAccount)
      .mockResolvedValueOnce(recoveredAccount);
    provider.findSubaccountByFriendlyName.mockResolvedValue({
      sid: recoveredAccount.subaccountSid,
      authToken: 'subaccount-token',
      friendlyName: baseAccount.friendlyName,
      status: 'active',
    });
    numbers.findActiveByOrganization.mockResolvedValue({
      phoneNumberSid: `PN${'4'.repeat(32)}`,
      phoneNumber: baseAccount.selectedPhoneNumber,
      voiceUrl: 'https://api.example.com/api/v1/webhooks/twilio/voice',
    });

    await service.processProvisioning('org-1', 'operation-1');

    expect(provider.createSubaccount).not.toHaveBeenCalled();
    expect(accounts.updateByOperation).toHaveBeenCalledWith(
      'org-1',
      'operation-1',
      expect.objectContaining({
        subaccountSid: recoveredAccount.subaccountSid,
      }),
    );
  });
});
