import { ApiProperty } from '@nestjs/swagger';
import { CreatePlatformMeetingDto } from './create-platform-meeting.dto';

export class CreateGoogleMeetingDto extends CreatePlatformMeetingDto {
  @ApiProperty({ example: 'https://meet.google.com/abc-defg-hij' })
  declare meetingUrl: string;
}
