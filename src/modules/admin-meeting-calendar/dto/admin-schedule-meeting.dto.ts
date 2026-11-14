import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { CreateConnectedMeetingDto } from '../../meeting-bots/dto/create-connected-meeting.dto';

export class AdminScheduleMeetingDto extends CreateConnectedMeetingDto {
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
}
