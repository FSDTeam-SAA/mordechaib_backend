import { BadRequestException } from '@nestjs/common';
import { parseContactCsv } from './contact-csv.parser';

describe('parseContactCsv', () => {
  it('parses quoted values, aliases, tags, and a UTF-8 BOM', () => {
    const csv =
      '\uFEFFfull name,email,phone,company,job title,tags,notes\r\n' +
      '"Tahid, Rahman",tahid@example.com,+8801812345678,Acme,Director,priority|customer,"Line one\nLine two"';

    expect(parseContactCsv(Buffer.from(csv, 'utf8'))).toEqual([
      {
        name: 'Tahid, Rahman',
        email: 'tahid@example.com',
        phone: '+8801812345678',
        company: 'Acme',
        jobTitle: 'Director',
        tags: ['priority', 'customer'],
        notes: 'Line one\nLine two',
      },
    ]);
  });

  it('rejects unknown columns', () => {
    expect(() =>
      parseContactCsv(Buffer.from('name,email,unknown\nTest,t@example.com,x')),
    ).toThrow(BadRequestException);
  });

  it('rejects an unclosed quoted value', () => {
    expect(() =>
      parseContactCsv(Buffer.from('name,email\n"Test,t@example.com')),
    ).toThrow('CSV contains an unclosed quote');
  });

  it('parses the extended customer profile columns', () => {
    const csv =
      'name,email,avatar_url,location,website,linkedin_url,lead_status\n' +
      'Mike Johnson,mike@example.com,https://example.com/mike.png,"New York, USA",https://example.com,https://www.linkedin.com/in/mike,Hot Lead';

    expect(parseContactCsv(Buffer.from(csv))).toEqual([
      {
        name: 'Mike Johnson',
        email: 'mike@example.com',
        avatarUrl: 'https://example.com/mike.png',
        location: 'New York, USA',
        website: 'https://example.com',
        linkedinUrl: 'https://www.linkedin.com/in/mike',
        leadStatus: 'HOT_LEAD',
      },
    ]);
  });
});
