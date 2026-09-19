import { PartialType } from '@nestjs/swagger';
import { CreateStrategicNoteDto } from './create-strategic-note.dto';

export class UpdateStrategicNoteDto extends PartialType(
  CreateStrategicNoteDto,
) {}
