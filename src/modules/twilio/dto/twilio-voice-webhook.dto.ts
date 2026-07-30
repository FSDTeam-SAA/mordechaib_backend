import { IsOptional, IsString } from 'class-validator';

export class TwilioVoiceWebhookDto {
  @IsString()
  AccountSid!: string;

  @IsString()
  CallSid!: string;

  @IsString()
  From!: string;

  @IsString()
  To!: string;

  @IsString()
  @IsOptional()
  CallStatus?: string;
}
