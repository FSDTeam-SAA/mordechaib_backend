import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { EmailProvider } from '../../../common/enums/email-provider.enum';

export class SendEmailDraftDto {
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional({ enum: EmailProvider })
  @IsOptional()
  @IsEnum(EmailProvider)
  provider?: EmailProvider;
}
