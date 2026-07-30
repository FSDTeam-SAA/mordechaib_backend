import { IsEnum } from 'class-validator';
import { BusinessIndustry } from '../../../common/enums/business-industry.enum';

export class UpdateIndustryDto {
  @IsEnum(BusinessIndustry)
  industry!: BusinessIndustry;
}
