import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateConnectedMeetingDto } from '../../meeting-bots/dto/create-connected-meeting.dto';

export class AdminScheduleMeetingDto extends OmitType(
  CreateConnectedMeetingDto,
  ['idempotencyKey'] as const,
) {
  @ApiProperty({
    description: 'Organization that owns the meeting and provider connection.',
  })
  @IsMongoId()
  organizationId!: string;

  @ApiProperty({
    description:
      'Active OWNER or ADMIN in the target organization on whose behalf the meeting is created.',
  })
  @IsMongoId()
  organizerUserId!: string;

  @ApiProperty({
    description:
      'Required retry-safe key. Reuse it only when retrying the same meeting creation request.',
    maxLength: 128,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;
}
