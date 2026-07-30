import { IsEnum } from 'class-validator';
import { BusinessSize } from '../../../common/enums/business-size.enum';

export class UpdateBusinessSizeDto {
  @IsEnum(BusinessSize)
  businessSize!: BusinessSize;
}
