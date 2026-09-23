import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateEmailDraftDto } from './create-email-draft.dto';

export class UpdateEmailDraftDto extends PartialType(
  OmitType(CreateEmailDraftDto, ['clientDraftId'] as const),
) {}
