import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { SupportRequestCategory } from '../../../common/enums/support-request.enum';

export class CreateSupportRequestDto {
  @ApiProperty({ enum: SupportRequestCategory })
  @IsEnum(SupportRequestCategory)
  category!: SupportRequestCategory;

  @ApiProperty({ minLength: 3, maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 20_000,
    description: 'Plain text. Render as text, not untrusted HTML.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(20_000)
  description!: string;
}
