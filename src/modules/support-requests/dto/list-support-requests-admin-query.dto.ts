import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListSupportRequestsQueryDto } from './list-support-requests-query.dto';

export class ListSupportRequestsAdminQueryDto extends ListSupportRequestsQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsMongoId()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ type: String })
  @IsMongoId()
  @IsOptional()
  createdByUserId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}
