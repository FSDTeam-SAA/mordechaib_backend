import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class DeleteContactEnquiryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
