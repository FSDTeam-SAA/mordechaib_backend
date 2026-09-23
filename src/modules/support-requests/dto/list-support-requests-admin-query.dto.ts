import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListSupportRequestsQueryDto } from './list-support-requests-query.dto';

export class ListSupportRequestsAdminQueryDto extends ListSupportRequestsQueryDto {
  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  createdByUserId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}
