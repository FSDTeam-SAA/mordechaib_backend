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

export enum AiProposalCommand {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  RETRY = 'RETRY',
}

export class ExecuteAiActionProposalDto {
  @ApiProperty({ enum: AiProposalCommand })
  @IsEnum(AiProposalCommand)
  action!: AiProposalCommand;

  @ApiPropertyOptional({
    description: 'Required when action is REJECT',
    maxLength: 1000,
  })
  @ValidateIf(
    (input: ExecuteAiActionProposalDto) =>
      input.action === AiProposalCommand.REJECT,
  )
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason?: string;
}
