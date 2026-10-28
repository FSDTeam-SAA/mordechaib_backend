import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { UpdateAiServiceControlDto } from './dto/update-ai-service-control.dto';
import { SystemServicesService } from './system-services.service';

@ApiTags('Platform System Services')
@ApiBearerAuth()
@Controller('platform/system-services')
@UseGuards(PlatformAdminGuard)
export class SystemServicesController {
  constructor(private readonly services: SystemServicesService) {}

  @Get('ai')
  @ApiOperation({ summary: 'Get the effective AI service control state' })
  getAiServiceControl() {
    return this.services.getAiServiceControl();
  }

  @Patch('ai')
  @ApiOperation({
    summary: 'Enable or temporarily disable every outbound AI operation',
  })
  updateAiServiceControl(
    @CurrentUser() actor: RequestUser,
    @Body() input: UpdateAiServiceControlDto,
  ) {
    return this.services.updateAiServiceControl(actor, input);
  }
}
