import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PublishProductUpdateDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:https?:\/\/|\/(?!\/))/, {
    message: 'actionUrl must be an HTTP(S) URL or an application path',
  })
  @MaxLength(1000)
  actionUrl?: string;
}
