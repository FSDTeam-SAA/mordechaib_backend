import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCalendarEventDto } from './create-calendar-event.dto';

export class UpdateCalendarEventDto extends PartialType(
  OmitType(CreateCalendarEventDto, ['idempotencyKey'] as const),
) {}
