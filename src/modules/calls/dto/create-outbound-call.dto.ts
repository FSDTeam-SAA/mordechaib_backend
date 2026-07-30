import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOutboundCallDto {
  @IsString()
  @IsNotEmpty()
  clientPhone!: string;

  @IsString()
  @IsOptional()
  contactId?: string;
}
