import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Allow,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateMessageDto {
  @ApiPropertyOptional({
    description:
      'Client-generated UUID used to safely retry the same HTTP message.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsUUID()
  @IsOptional()
  clientMessageId?: string;

  @ApiPropertyOptional({
    description: 'Plain/raw message content. May be combined with attachments.',
    maxLength: 20_000,
  })
  @IsString()
  @MaxLength(20_000)
  @IsOptional()
  content?: string;

  // Swagger and some multipart clients submit an empty `files` text field
  // when no file was selected. Real files are handled by Multer and exposed
  // through @UploadedFiles(); this property only prevents that empty UI field
  // from failing the global forbidNonWhitelisted validation.
  @Allow()
  @IsOptional()
  files?: unknown;
}
