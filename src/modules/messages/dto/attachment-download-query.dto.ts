import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum AttachmentDisposition {
  INLINE = 'inline',
  ATTACHMENT = 'attachment',
}

export class AttachmentDownloadQueryDto {
  @ApiPropertyOptional({
    enum: AttachmentDisposition,
    default: AttachmentDisposition.INLINE,
  })
  @IsEnum(AttachmentDisposition)
  @IsOptional()
  disposition: AttachmentDisposition = AttachmentDisposition.INLINE;
}
