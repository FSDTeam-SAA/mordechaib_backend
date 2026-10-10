import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class UpdateAiActionProposalDto {
  @ApiPropertyOptional({
    description:
      'Current proposal revision returned by the API. When omitted by an older client, the backend uses the latest stored revision and still performs an atomic update.',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;

  @ApiProperty({
    type: Object,
    description:
      'Partial proposal payload. It is merged with the stored payload and validated against the proposal action type.',
    example: {
      title: 'Client review meeting',
      startsAt: '2026-10-05T09:00:00.000Z',
      durationMinutes: 30,
      timezone: 'Asia/Dhaka',
      invitees: ['client@example.com'],
    },
  })
  @IsObject()
  payload!: Record<string, unknown>;
}
