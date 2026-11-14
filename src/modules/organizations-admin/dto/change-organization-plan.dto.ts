import { IsIn, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeOrganizationPlanDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  planId!: string;

  @ApiProperty({ enum: ['month', 'year'] })
  @IsIn(['month', 'year'])
  billingInterval!: 'month' | 'year';
}
