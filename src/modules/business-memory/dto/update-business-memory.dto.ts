import { PartialType } from '@nestjs/swagger';
import { CreateBusinessMemoryDto } from './create-business-memory.dto';

/** Owner edits; editing a pending memory does not approve it. */
export class UpdateBusinessMemoryDto extends PartialType(
  CreateBusinessMemoryDto,
) {}
