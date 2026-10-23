import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAiChatHistoryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 50;

  @ApiPropertyOptional({ description: 'Opaque older-message cursor.' })
  @IsString()
  @IsOptional()
  cursor?: string;
}
