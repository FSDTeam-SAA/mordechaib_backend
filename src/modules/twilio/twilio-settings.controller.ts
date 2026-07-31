import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { SaveTwilioSettingsDto } from './dto/save-twilio-settings.dto';
import { TwilioSettingsService } from './twilio-settings.service';

@ApiTags('Twilio settings')
@ApiBearerAuth()
@Controller('twilio/settings')
@UseGuards(OrganizationGuard)
export class TwilioSettingsController {
  constructor(private readonly settingsService: TwilioSettingsService) {}

  @Post()
  save(
    @CurrentOrg() organization: RequestOrganization,
    @Body() input: SaveTwilioSettingsDto,
  ) {
    return this.settingsService.save(organization.id, input);
  }
}
