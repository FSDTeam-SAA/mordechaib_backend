import { IsNotEmpty, IsString } from 'class-validator';

export class AssignAdminDto {
  @IsString()
  @IsNotEmpty()
  adminId!: string;
}