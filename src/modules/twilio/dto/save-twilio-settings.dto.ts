import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, Matches } from 'class-validator';
import { TwilioSettingStatus } from '../../../common/enums/twilio-setting-status.enum';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizePhone({ value }: { value: unknown }): unknown {
  return typeof value === 'string'
    ? value.replace(/[\s()-]/g, '').trim()
    : value;
}

export class SaveTwilioSettingsDto {
  @Transform(normalizePhone)
  @Matches(E164_PATTERN, {
    message: 'twilioNumber must be a valid E.164 phone number',
  })
  twilioNumber!: string;

  @Transform(normalizePhone)
  @Matches(E164_PATTERN, {
    message: 'forwardingNumber must be a valid E.164 phone number',
  })
  forwardingNumber!: string;

  @IsBoolean()
  @IsOptional()
  isRecordingEnabled?: boolean;

  @IsEnum(TwilioSettingStatus)
  @IsOptional()
  status?: TwilioSettingStatus;
}
