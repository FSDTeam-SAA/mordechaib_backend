import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { ListContactsQueryDto } from '../../contacts/dto/list-contacts-query.dto';

export class ListAiInternalCustomersQueryDto extends ListContactsQueryDto {
  @ApiProperty({ type: String })
  @IsMongoId()
  requesterUserId!: string;
}
