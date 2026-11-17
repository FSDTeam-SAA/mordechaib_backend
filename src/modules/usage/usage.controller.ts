import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-context.type';
import { UsageService } from './usage.service';

@ApiTags('Usage')
@ApiBearerAuth()
@Controller('usage')
export class UsageController {
  constructor(private readonly service: UsageService) {}

  @Get()
  @ApiOperation({
    summary: 'Get organization usage for the current subscription period',
  })
  current(@CurrentUser() user: RequestUser) {
    return this.service.current(user.organizationId);
  }
}
