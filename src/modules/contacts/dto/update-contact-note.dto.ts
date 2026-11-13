import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateContactNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 10_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content!: string;

  @ApiProperty({ minimum: 1, description: 'Current note revision' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
