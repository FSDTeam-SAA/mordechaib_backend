import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export enum CallIntelligenceProposalCommand {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  RETRY = 'RETRY',
}

export class ExecuteCallIntelligenceProposalDto {
  @ApiProperty({ enum: CallIntelligenceProposalCommand })
  @IsEnum(CallIntelligenceProposalCommand)
  action!: CallIntelligenceProposalCommand;

  @ApiPropertyOptional({
    description: 'Required when action is REJECT',
    maxLength: 1000,
  })
  @ValidateIf(
    (input: ExecuteCallIntelligenceProposalDto) =>
      input.action === CallIntelligenceProposalCommand.REJECT,
  )
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason?: string;
}
