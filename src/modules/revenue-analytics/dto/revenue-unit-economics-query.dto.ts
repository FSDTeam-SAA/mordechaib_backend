import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsTimeZone } from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

/**
 * Unit economics currently reports platform-wide provider costs. Plan and
 * acquisition-channel filtering are intentionally deferred until costs have
 * an authoritative allocation model.
 */
export class RevenueUnitEconomicsQueryDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Inclusive UTC start of the reporting period.',
  })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({
    format: 'date-time',
    description: 'Exclusive UTC end of the reporting period.',
  })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiProperty({ example: 'Asia/Dhaka' })
  @Transform(trimString)
  @IsTimeZone()
  timezone!: string;
}
