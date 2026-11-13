import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdatePlatformBrandingDto {
  @ApiProperty({
    minimum: 0,
    description: 'Revision returned by GET /platform/settings.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}
