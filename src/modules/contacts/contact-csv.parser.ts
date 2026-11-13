import { BadRequestException } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import { MAX_BULK_CONTACTS } from './dto/bulk-create-contacts.dto';

const HEADER_ALIASES: Record<string, keyof CreateContactDto> = {
  name: 'name',
  full_name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  job_title: 'jobTitle',
  jobtitle: 'jobTitle',
  avatar_url: 'avatarUrl',
  avatar: 'avatarUrl',
  location: 'location',
  website: 'website',
  linkedin_url: 'linkedinUrl',
  linkedin: 'linkedinUrl',
  lead_status: 'leadStatus',
  leadstatus: 'leadStatus',
  notes: 'notes',
  tags: 'tags',
};

export function parseContactCsv(buffer: Buffer): CreateContactDto[] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows = parseRows(text).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );
  if (rows.length < 2) {
    throw new BadRequestException(
      'CSV must contain a header and at least one contact row',
    );
  }

  const headers = rows[0].map(normalizeHeader);
  const unknown = headers.filter((header) => !HEADER_ALIASES[header]);
  if (unknown.length) {
    throw new BadRequestException(
      `Unsupported CSV columns: ${[...new Set(unknown)].join(', ')}`,
    );
  }
  if (!headers.some((header) => HEADER_ALIASES[header] === 'name')) {
    throw new BadRequestException(
      'CSV must include a name or full_name column',
    );
  }
  if (new Set(headers).size !== headers.length) {
    throw new BadRequestException('CSV contains duplicate columns');
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_BULK_CONTACTS) {
    throw new BadRequestException(
      `A contact import supports at most ${MAX_BULK_CONTACTS} rows`,
    );
  }
  return dataRows.map((row, index) => {
    if (row.length > headers.length) {
      throw new BadRequestException(
        `CSV row ${index + 2} contains more values than the header`,
      );
    }
    const contact: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      const field = HEADER_ALIASES[header];
      const value = (row[column] || '').trim();
      if (!value) return;
      contact[field] =
        field === 'tags'
          ? value
              .split('|')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : field === 'leadStatus'
            ? value.toUpperCase().replace(/[\s-]+/g, '_')
            : value;
    });
    return contact as unknown as CreateContactDto;
  });
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (character === '\r' && input[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new BadRequestException('CSV contains an unclosed quote');
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
