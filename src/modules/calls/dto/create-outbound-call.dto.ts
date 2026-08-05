import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizePhone({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.replace(/[\s()-]/g, '').trim() : value;
}

export class CreateOutboundCallDto {
  /**
   * The client / customer number the agent will be bridged to.
   */
  @Transform(normalizePhone)
  @Matches(E164_PATTERN, {
    message: 'clientPhone must be a valid E.164 phone number',
  })
  clientPhone!: string;

  /**
   * The agent's phone number that rings first (click-to-call first leg).
   * Defaults to the organization's configured forwarding number.
   */
  @Transform(normalizePhone)
  @Matches(E164_PATTERN, {
    message: 'agentPhone must be a valid E.164 phone number',
  })
  @IsOptional()
  agentPhone?: string;

  @IsString()
  @IsOptional()
  contactId?: string;
}