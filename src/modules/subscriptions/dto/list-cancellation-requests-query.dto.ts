import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CancellationRequestStatus } from '../../../common/enums/cancellation-request-status.enum';

export class ListCancellationRequestsQueryDto {
  @IsOptional()
  @IsEnum(CancellationRequestStatus)
  status?: CancellationRequestStatus;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}