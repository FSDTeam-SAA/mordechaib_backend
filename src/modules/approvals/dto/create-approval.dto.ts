import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateApprovalDto {
  @IsString()
  @IsNotEmpty()
  actionType!: string;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
