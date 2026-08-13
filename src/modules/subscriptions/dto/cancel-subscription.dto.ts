import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CancellationReason } from '../../../common/enums/cancellation-reason.enum';
import { RetentionOfferChoice } from '../../../common/enums/retention-offer-choice.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class CancelSubscriptionDto {
  @IsEnum(CancellationReason)
  reason!: CancellationReason;

  // Required when reason is OTHER — enforced in the service, not here,
  // since class-validator's conditional decorators read awkwardly for a
  // single field and the service already has the full picture.
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  reasonDetail?: string;

  @IsOptional()
  @IsEnum(RetentionOfferChoice)
  retentionOfferChoice?: RetentionOfferChoice = RetentionOfferChoice.NONE;

  @IsString()
  @MinLength(1)
  password!: string;
}