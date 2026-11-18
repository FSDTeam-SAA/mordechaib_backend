import { PartialType, PickType } from '@nestjs/swagger';
import { CreateRevenueAcquisitionCostDto } from './create-revenue-acquisition-cost.dto';

export class UpdateRevenueAcquisitionCostDto extends PartialType(
  PickType(CreateRevenueAcquisitionCostDto, [
    'salesCostUsd',
    'marketingCostUsd',
    'notes',
  ] as const),
) {}
