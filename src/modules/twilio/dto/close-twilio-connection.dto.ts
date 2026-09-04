import { Equals } from 'class-validator';

export class CloseTwilioConnectionDto {
  @Equals(true, { message: 'confirmClose must be true' })
  confirmClose!: boolean;
}
