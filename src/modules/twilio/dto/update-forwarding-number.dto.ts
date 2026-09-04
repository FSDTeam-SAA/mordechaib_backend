import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export class UpdateForwardingNumberDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '').trim() : value,
  )
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'forwardingNumber must be a valid E.164 phone number',
  })
  forwardingNumber!: string;
}
