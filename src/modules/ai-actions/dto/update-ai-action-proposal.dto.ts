import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, Min } from 'class-validator';

export class UpdateAiActionProposalDto {
  @ApiProperty({
    description:
      'Current proposal revision returned by the API. The edit is rejected if another update has already changed the proposal.',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

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
