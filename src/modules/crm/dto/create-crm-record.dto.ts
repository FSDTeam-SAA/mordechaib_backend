import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class CreateCrmRecordDto {
  @ApiProperty({
    type: Object,
    description:
      'Provider field names and values validated against the connected account schema',
    example: { firstname: 'Amit', email: 'amit@example.com' },
  })
  @IsObject()
  properties!: Record<string, unknown>;
}
