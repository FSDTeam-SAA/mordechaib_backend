import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { GetContactWorkspaceQueryDto } from '../../contacts/dto/get-contact-workspace-query.dto';

export class GetAiInternalCustomerQueryDto extends GetContactWorkspaceQueryDto {
  @ApiProperty({ type: String })
  @IsMongoId()
  requesterUserId!: string;
}
