import { ContactCommercialContextService } from './contact-commercial-context.service';

describe('ContactCommercialContextService', () => {
  const contact = {
    id: '66cc9bdfa847ea856c7b4104',
    name: 'Marvin McKinney',
    company: 'Acme Ltd',
  };

  function setup() {
    const contacts = {
      get: jest.fn().mockResolvedValue(contact),
      findActiveByPhone: jest.fn().mockResolvedValue(contact),
    };
    const crmLinks = {
      list: jest.fn().mockResolvedValue({
        items: [
          {
            provider: 'HUBSPOT',
            objectType: 'deals',
            externalId: 'deal-1',
          },
          {
            provider: 'HUBSPOT',
            objectType: 'contacts',
            externalId: 'contact-1',
          },
        ],
      }),
    };
    const repository = {
      linkedDeals: jest.fn().mockResolvedValue([
        {
          _id: '66cc9bdfa847ea856c7b4105',
          provider: 'HUBSPOT',
          externalId: 'deal-1',
          amount: 6300,
          currency: 'USD',
          stageCategory: 'OPEN',
        },
      ]),
    };
    const commercialSummary = {
      build: jest.fn().mockReturnValue({
        commercial: {
          dealValue: {
            availability: 'AVAILABLE',
            aggregateAvailable: true,
            value: 6300,
            currency: 'USD',
            dealCount: 1,
          },
          closeProbability: { availability: 'UNAVAILABLE' },
        },
      }),
    };
    return {
      contacts,
      crmLinks,
      repository,
      commercialSummary,
      service: new ContactCommercialContextService(
        contacts as never,
        crmLinks as never,
        repository as never,
        commercialSummary as never,
      ),
    };
  }

  it('returns grounded open-pipeline context for an explicitly linked customer', async () => {
    const { service, contacts, repository, commercialSummary } = setup();

    const result = await service.resolve('org-1', {
      contactId: contact.id,
      phone: '+15551234567',
    });

    expect(result).toEqual(
      expect.objectContaining({
        availability: 'AVAILABLE',
        customer: { id: contact.id, name: contact.name, company: 'Acme Ltd' },
        resolution: 'SOURCE_CONTACT_ID',
        linkedDealCount: 1,
        revenue: expect.objectContaining({
          availability: 'AVAILABLE',
          value: 6300,
          currency: 'USD',
          semantic: 'OPEN_PIPELINE_VALUE',
          attribution: 'CUSTOMER_LINKED_CRM_DEALS',
          attributedToSource: false,
        }),
      }),
    );
    expect(contacts.get).toHaveBeenCalledWith('org-1', contact.id);
    expect(contacts.findActiveByPhone).not.toHaveBeenCalled();
    expect(repository.linkedDeals).toHaveBeenCalledWith('org-1', [
      { provider: 'HUBSPOT', externalId: 'deal-1' },
    ]);
    expect(commercialSummary.build).toHaveBeenCalledWith(
      expect.objectContaining({ latestHealth: null }),
    );
  });

  it('uses an exact active-customer phone match for a legacy call', async () => {
    const { service, contacts } = setup();

    const result = await service.resolve('org-1', {
      phone: '+15551234567',
    });

    expect(result.resolution).toBe('EXACT_PHONE_MATCH');
    expect(contacts.findActiveByPhone).toHaveBeenCalledWith(
      'org-1',
      '+15551234567',
    );
  });

  it('returns an explicit unavailable result without querying CRM when no customer resolves', async () => {
    const { service, contacts, crmLinks, repository } = setup();
    contacts.findActiveByPhone.mockResolvedValue(null);

    const result = await service.resolve('org-1', {
      phone: '+15550000000',
    });

    expect(result).toEqual(
      expect.objectContaining({
        availability: 'UNAVAILABLE',
        customer: null,
        linkedDealCount: 0,
        revenue: expect.objectContaining({
          availability: 'UNAVAILABLE',
          attributedToSource: false,
        }),
      }),
    );
    expect(crmLinks.list).not.toHaveBeenCalled();
    expect(repository.linkedDeals).not.toHaveBeenCalled();
  });
});
