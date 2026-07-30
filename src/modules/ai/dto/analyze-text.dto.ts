import { IsNotEmpty, IsString } from 'class-validator';

export class AnalyzeTextDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}
