import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';
import { CreatePlatformMeetingDto } from './create-platform-meeting.dto';

export class CreateMeetingBotDto extends CreatePlatformMeetingDto {
  @ApiProperty({ enum: MeetingPlatform, example: MeetingPlatform.GOOGLE_MEET })
  @IsEnum(MeetingPlatform)
  platform!: MeetingPlatform;
}
