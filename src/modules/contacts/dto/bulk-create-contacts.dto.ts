import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateContactDto } from './create-contact.dto';

export const MAX_BULK_CONTACTS = 200;

export class BulkCreateContactsDto {
  @ApiProperty({
    type: [CreateContactDto],
    minItems: 1,
    maxItems: MAX_BULK_CONTACTS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_CONTACTS)
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts!: CreateContactDto[];
}
