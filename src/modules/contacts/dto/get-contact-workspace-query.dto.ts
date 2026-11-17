import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetContactWorkspaceQueryDto {
  @ApiPropertyOptional({ type: Number, default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  taskLimit: number = 5;

  @ApiPropertyOptional({ type: Number, default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  meetingLimit: number = 5;

  @ApiPropertyOptional({ type: Number, default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  callLimit: number = 5;

  @ApiPropertyOptional({ type: Number, default: 3, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  noteLimit: number = 3;

  @ApiPropertyOptional({ type: Number, default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  fileLimit: number = 5;
}
