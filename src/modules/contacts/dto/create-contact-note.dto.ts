import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 10_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content!: string;
}
