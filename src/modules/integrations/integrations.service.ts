import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { TwilioProvisioningStatus } from '../../common/enums/twilio-provisioning-status.enum';
import { IntegrationsRepository } from './integrations.repository';

const INTEGRATION_CARDS = [
  {
    provider: 'FACEBOOK',
    label: 'Facebook',
    lookup: [IntegrationProvider.META],
    connectPath: '/meta/connect',
  },
  {
    provider: 'INSTAGRAM',
    label: 'Instagram',
    lookup: [IntegrationProvider.META],
    connectPath: '/meta/connect',
  },
  {
    provider: IntegrationProvider.OUTLOOK_CALENDAR,
    label: 'Outlook Calendar',
    lookup: [IntegrationProvider.OUTLOOK_CALENDAR],
    connectPath: '/calendar/outlook/oauth/connect',
  },
  {
    provider: IntegrationProvider.GOOGLE_CALENDAR,
    label: 'Google Calendar',
    lookup: [IntegrationProvider.GOOGLE_CALENDAR],
    connectPath: '/google-meetings/oauth/connect',
  },
  {
    provider: IntegrationProvider.TWILIO,
    label: 'Twilio',
    lookup: [IntegrationProvider.TWILIO],
    connectPath: '/twilio/connection',
  },
  {
    provider: IntegrationProvider.GMAIL,
    label: 'Gmail',
    lookup: [IntegrationProvider.GMAIL],
    connectPath: undefined,
  },
  {
    provider: IntegrationProvider.SALESFORCE,
    label: 'Salesforce',
    lookup: [IntegrationProvider.SALESFORCE],
    connectPath: undefined,
  },
  {
    provider: IntegrationProvider.HUBSPOT,
    label: 'HubSpot CRM',
    lookup: [IntegrationProvider.HUBSPOT],
    connectPath: undefined,
  },
  {
    provider: 'CUSTOM_CRM_API',
    label: 'Custom CRM API',
    lookup: [],
    connectPath: undefined,
  },
] as const;

@Injectable()
export class IntegrationsService {
  constructor(private readonly repository: IntegrationsRepository) {}

  async findAll(organizationId: string) {
    const [integrations, twilioAccount, twilioSetting] = await Promise.all([
      this.repository.findByOrganization(organizationId),
      this.repository.findTwilioAccount(organizationId),
      this.repository.findTwilioSetting(organizationId),
    ]);

    return {
      organizationId,
      items: INTEGRATION_CARDS.map((card) => {
        if (card.provider === IntegrationProvider.TWILIO) {
          return this.twilioCard(card, twilioAccount, twilioSetting);
        }

        const connection = integrations.find((item) =>
          card.lookup.some((provider) => item.provider === provider),
        );
        const metadata = (connection?.metadata || {}) as Record<
          string,
          unknown
        >;
        const status = connection?.status || 'NOT_CONFIGURED';

        return {
          provider: card.provider,
          label: card.label,
          connected: status === 'CONNECTED',
          status,
          isDefault: Boolean(connection?.isDefaultCalendar),
          connectPath: card.connectPath,
          account: {
            id: metadata.providerAccountId,
            email: metadata.providerEmail,
            name: metadata.providerName,
          },
          connectedByUserId: metadata.connectedByUserId,
          expiresAt: connection?.expiresAt,
        };
      }),
    };
  }

  private twilioCard(
    card: (typeof INTEGRATION_CARDS)[number],
    account: Awaited<ReturnType<IntegrationsRepository['findTwilioAccount']>>,
    setting: Awaited<ReturnType<IntegrationsRepository['findTwilioSetting']>>,
  ) {
    const status = account
      ? this.twilioStatus(account.provisioningStatus)
      : setting?.status === 'ACTIVE'
        ? 'CONNECTED'
        : setting
          ? 'DISCONNECTED'
          : 'NOT_CONFIGURED';

    return {
      provider: card.provider,
      label: card.label,
      connected: status === 'CONNECTED',
      status,
      isDefault: false,
      connectPath: card.connectPath,
      account: account
        ? { id: account.subaccountSid, name: account.friendlyName }
        : setting
          ? { id: setting.twilioNumber }
          : undefined,
      connectedByUserId: undefined,
      expiresAt: undefined,
    };
  }

  private twilioStatus(status: TwilioProvisioningStatus) {
    if (status === TwilioProvisioningStatus.ACTIVE) return 'CONNECTED';
    if (status === TwilioProvisioningStatus.FAILED) return 'FAILED';
    if (
      status === TwilioProvisioningStatus.CLOSED ||
      status === TwilioProvisioningStatus.SUSPENDED
    ) {
      return 'DISCONNECTED';
    }
    return 'PENDING';
  }
}
