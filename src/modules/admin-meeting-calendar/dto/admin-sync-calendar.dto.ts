import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { SyncCalendarDto } from '../../calendar/dto/sync-calendar.dto';

export class AdminSyncCalendarDto extends SyncCalendarDto {
  @ApiProperty({
    description: 'Organization whose connected calendars are synchronized.',
  })
  @IsMongoId()
  organizationId!: string;

  @ApiProperty({
    description:
      'Active OWNER or ADMIN in the target organization used to attribute newly synchronized events.',
  })
  @IsMongoId()
  organizerUserId!: string;
}
