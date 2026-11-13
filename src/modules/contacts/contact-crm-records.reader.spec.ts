import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactCrmRecordsReader } from './contact-crm-records.reader';

describe('ContactCrmRecordsReader', () => {
  const id = '66cc9bdfa847ea856c7b41d4';
  let model: Record<string, jest.Mock>;
  let reader: ContactCrmRecordsReader;

  beforeEach(() => {
    model = { findOne: jest.fn(), find: jest.fn() };
    reader = new ContactCrmRecordsReader(model as never);
  });

  it('reads a tenant-scoped CRM record without private provider payload', async () => {
    const exec = jest.fn().mockResolvedValue({
      _id: id,
      organizationId: 'org-1',
      provider: 'HUBSPOT',
      externalId: 'external-1',
      rawPayload: { private: true },
    });
    const lean = jest.fn().mockReturnValue({ exec });
    model.findOne.mockReturnValue({ lean });

    await expect(reader.get('org-1', id)).resolves.toEqual({
      id,
      provider: 'HUBSPOT',
      externalId: 'external-1',
    });
    expect(model.findOne).toHaveBeenCalledWith({
      _id: id,
      organizationId: 'org-1',
    });
  });

  it('rejects invalid IDs before querying MongoDB', async () => {
    await expect(reader.get('org-1', 'invalid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it('returns not found without leaking records from another tenant', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    model.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec }),
    });

    await expect(reader.get('org-1', id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
