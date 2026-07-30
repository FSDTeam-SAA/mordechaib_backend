import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { CreateCrmContactDto } from './dto/create-crm-contact.dto';
import { CrmService } from './crm.service';

@Controller('crm')
@UseGuards(OrganizationGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post('contacts')
  createContact(
    @CurrentOrg() org: { id: string },
    @Body() dto: CreateCrmContactDto,
  ) {
    return this.crmService.createContact(org.id, dto);
  }
}
