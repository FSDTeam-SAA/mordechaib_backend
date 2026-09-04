import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, Matches } from 'class-validator';
import { TwilioCountry } from '../../../common/enums/twilio-country.enum';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()-]/g, '').trim() : value;

export class ProvisionTwilioDto {
  @Transform(normalizePhone)
  @Matches(E164_PATTERN, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber!: string;

  @IsEnum(TwilioCountry)
  country!: TwilioCountry;

  @Transform(normalizePhone)
  @Matches(E164_PATTERN, {
    message: 'forwardingNumber must be a valid E.164 phone number',
  })
  forwardingNumber!: string;

  @IsBoolean()
  @IsOptional()
  isRecordingEnabled?: boolean;
}
