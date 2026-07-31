import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddAdminNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  statusNote?: string;
}