import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmailProvider } from '../../../common/enums/email-provider.enum';
import { EmailDraftSourceType } from '../../../common/enums/email-draft-source-type.enum';

export class EmailDraftSourceDto {
  @ApiPropertyOptional({ enum: EmailDraftSourceType })
  @IsEnum(EmailDraftSourceType)
  type!: EmailDraftSourceType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  id!: string;
}

export class CreateEmailDraftDto {
  @ApiPropertyOptional({ enum: EmailProvider })
  @IsOptional()
  @IsEnum(EmailProvider)
  provider?: EmailProvider;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @ApiPropertyOptional({ type: EmailDraftSourceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailDraftSourceDto)
  source?: EmailDraftSourceDto;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientDraftId?: string;
}
