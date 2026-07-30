import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateCrmContactDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
