import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { CloseTwilioConnectionDto } from './dto/close-twilio-connection.dto';
import { ProvisionTwilioDto } from './dto/provision-twilio.dto';
import { SearchTwilioNumbersDto } from './dto/search-twilio-numbers.dto';
import { UpdateForwardingNumberDto } from './dto/update-forwarding-number.dto';
import { TwilioProvisioningService } from './twilio-provisioning.service';
import { TwilioUsageService } from './twilio-usage.service';

@ApiTags('Twilio connection')
@ApiBearerAuth()
@Controller('twilio')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class TwilioManagementController {
  constructor(
    private readonly provisioning: TwilioProvisioningService,
    private readonly usage: TwilioUsageService,
  ) {}

  @Get('connection')
  @ApiOperation({ summary: 'Get the organization Twilio connection status' })
  getConnection(@CurrentOrg() organization: RequestOrganization) {
    return this.provisioning.getConnection(organization.id);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current Twilio call-minute usage' })
  getUsage(@CurrentOrg() organization: RequestOrganization) {
    return this.usage.getCurrentUsage(organization.id);
  }

  @Get('numbers/available')
  @ApiOperation({ summary: 'Search voice-enabled local Twilio numbers' })
  searchNumbers(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: SearchTwilioNumbersDto,
  ) {
    return this.provisioning.searchAvailableNumbers(organization.id, query);
  }

  @Post('connection')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start managed Twilio subaccount provisioning' })
  provision(
    @CurrentOrg() organization: RequestOrganization,
    @Body() input: ProvisionTwilioDto,
  ) {
    return this.provisioning.startProvisioning(organization.id, input);
  }

  @Post('connection/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry failed Twilio provisioning' })
  retry(@CurrentOrg() organization: RequestOrganization) {
    return this.provisioning.retryProvisioning(organization.id);
  }

  @Patch('connection/forwarding-number')
  @ApiOperation({ summary: 'Update the Twilio forwarding number' })
  updateForwardingNumber(
    @CurrentOrg() organization: RequestOrganization,
    @Body() input: UpdateForwardingNumberDto,
  ) {
    return this.provisioning.updateForwardingNumber(
      organization.id,
      input.forwardingNumber,
    );
  }

  @Post('connection/close')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Permanently close the Twilio connection' })
  close(
    @CurrentOrg() organization: RequestOrganization,
    @Body() input: CloseTwilioConnectionDto,
  ) {
    return this.provisioning.requestClosure(
      organization.id,
      input.confirmClose,
    );
  }
}
