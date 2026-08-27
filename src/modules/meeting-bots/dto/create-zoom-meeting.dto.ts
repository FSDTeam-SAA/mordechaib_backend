import { ApiProperty } from '@nestjs/swagger';
import { CreatePlatformMeetingDto } from './create-platform-meeting.dto';

export class CreateZoomMeetingDto extends CreatePlatformMeetingDto {
  @ApiProperty({ example: 'https://zoom.us/j/123456789?pwd=example' })
  declare meetingUrl: string;
}
