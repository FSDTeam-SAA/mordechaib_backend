import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactCommercialSummaryService } from './contact-commercial-summary.service';
import { ContactCrmLinksService } from './contact-crm-links.service';
import { ContactWorkspaceRepository } from './contact-workspace.repository';
import { ContactsService } from './contacts.service';

export type ContactCommercialReference = {
  contactId?: string;
  phone?: string;
};

@Injectable()
export class ContactCommercialContextService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly crmLinks: ContactCrmLinksService,
    private readonly repository: ContactWorkspaceRepository,
    private readonly commercialSummary: ContactCommercialSummaryService,
  ) {}

  async resolve(
    organizationId: string,
    reference: ContactCommercialReference,
  ) {
    const resolved = await this.resolveContact(organizationId, reference);
    if (!resolved) {
      return this.unavailable(
        'No active customer is linked to this source or exact phone number.',
      );
    }

    const crm = await this.crmLinks.list(organizationId, resolved.contact.id);
    const dealLinks = crm.items.filter((link) =>
      this.isDealObjectType(String(link.objectType)),
    );
    const deals = await this.repository.linkedDeals(
      organizationId,
      dealLinks.map((link) => ({
        provider: String(link.provider),
        externalId: String(link.externalId),
      })),
    );
    const summary = this.commercialSummary.build({
      profile: resolved.contact,
      crmLinks: dealLinks,
      deals: deals as unknown as Record<string, unknown>[],
      latestHealth: null,
    });
    const dealValue = summary.commercial.dealValue;

    return {
      availability: dealLinks.length ? 'AVAILABLE' : 'UNAVAILABLE',
      reason: dealLinks.length
        ? null
        : 'The customer has no explicitly linked CRM deal.',
      customer: {
        id: resolved.contact.id,
        name: resolved.contact.name,
        company: resolved.contact.company ?? null,
      },
      resolution: resolved.resolution,
      linkedDealCount: deals.length,
      revenue: {
        ...dealValue,
        semantic: 'OPEN_PIPELINE_VALUE',
        attribution: 'CUSTOMER_LINKED_CRM_DEALS',
        attributedToSource: false,
      },
      commercial: summary.commercial,
    };
  }

  private async resolveContact(
    organizationId: string,
    reference: ContactCommercialReference,
  ) {
    if (reference.contactId) {
      try {
        const contact = await this.contacts.get(
          organizationId,
          reference.contactId,
        );
        return { contact, resolution: 'SOURCE_CONTACT_ID' as const };
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    if (!reference.phone) return null;
    const contact = await this.contacts.findActiveByPhone(
      organizationId,
      reference.phone,
    );
    return contact
      ? { contact, resolution: 'EXACT_PHONE_MATCH' as const }
      : null;
  }

  private isDealObjectType(value: string) {
    return ['deal', 'deals', 'opportunity', 'opportunities'].includes(
      value.trim().toLowerCase(),
    );
  }

  private unavailable(reason: string) {
    return {
      availability: 'UNAVAILABLE',
      reason,
      customer: null,
      resolution: null,
      linkedDealCount: 0,
      revenue: {
        availability: 'UNAVAILABLE',
        reason,
        semantic: 'OPEN_PIPELINE_VALUE',
        attribution: 'CUSTOMER_LINKED_CRM_DEALS',
        attributedToSource: false,
      },
      commercial: null,
    };
  }
}
