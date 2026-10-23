import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateMessageDto {
  @ApiProperty({
    description:
      'Set true for the first message of a new chat; set false when conversationId identifies an existing chat.',
    example: true,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  startNewConversation!: boolean;

  @ApiPropertyOptional({
    description:
      'Existing conversation to append to. Required when startNewConversation=false and forbidden when it is true.',
  })
  @Transform(blankToUndefined)
  @IsMongoId()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated UUID used to safely retry the same HTTP message.',
  })
  @Transform(blankToUndefined)
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

  @ApiPropertyOptional({
    description:
      'Switch the conversation to this active platform agent for this and later turns.',
  })
  @Transform(blankToUndefined)
  @IsMongoId()
  @IsOptional()
  selectedAgentId?: string;

  // Swagger and some multipart clients submit an empty `files` text field
  // when no file was selected. Real files are handled by Multer and exposed
  // through @UploadedFiles(); this property only prevents that empty UI field
  // from failing the global forbidNonWhitelisted validation.
  @Allow()
  @IsOptional()
  files?: unknown;
}
