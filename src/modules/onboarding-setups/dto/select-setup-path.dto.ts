import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class SelectSetupPathDto {
  @ApiProperty({
    description:
      'Active setup-package identifier selected from the public setup catalog',
  })
  @IsMongoId()
  setupPackageId!: string;
}
