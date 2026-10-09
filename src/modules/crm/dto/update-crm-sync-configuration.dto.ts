import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const CRM_OBJECT_TYPE_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const CRM_FIELD_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,255}$/;

export class CrmObjectSyncSelectionDto {
  @ApiProperty({
    example: 'Contact',
    description:
      'Provider object identifier returned by the CRM schema discovery endpoint.',
  })
  @IsString()
  @Matches(CRM_OBJECT_TYPE_PATTERN)
  objectType!: string;

  @ApiProperty({
    example: ['FirstName', 'LastName', 'Email', 'Phone'],
    description:
      'Readable provider field names returned by the object schema endpoint.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @Matches(CRM_FIELD_NAME_PATTERN, { each: true })
  fields!: string[];
}

export class UpdateCrmSyncConfigurationDto {
  @ApiProperty({
    type: [CrmObjectSyncSelectionDto],
    description:
      'Objects and fields selected for synchronization. Send an empty array to disable multi-object synchronization for this connection.',
    maxItems: 25,
  })
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => CrmObjectSyncSelectionDto)
  objects!: CrmObjectSyncSelectionDto[];
}
