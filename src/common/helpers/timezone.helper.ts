import { BadRequestException } from '@nestjs/common';

export function assertValidTimezone(timezone: string, field = 'timezone') {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException(`${field} must be a valid IANA timezone`);
  }
}
