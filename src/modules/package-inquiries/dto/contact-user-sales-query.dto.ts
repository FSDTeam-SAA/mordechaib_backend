import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class ContactUserSalesQueryDto {
  @ApiProperty({
    description: 'Email subject to the user',
    example: 'Regarding your inquiry with Noltra.ai Sales',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    description: 'Message body to email to the user',
    example: 'Hello John, we received your inquiry regarding Enterprise pricing...',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
