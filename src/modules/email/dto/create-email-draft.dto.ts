import { ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { EmailProvider } from '../../../common/enums/email-provider.enum';

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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientDraftId?: string;
}
