import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SubscriptionPlanQueryDto } from './dto/subscription-plan-query.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';

@ApiTags('Subscription plans')
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(private readonly service: SubscriptionPlansService) {}

  // Public pricing page — always active plans only, never exposes the
  // includeInactive flag (that's admin-only, see below).
  @Public()
  @Get()
  findAllPublic() {
    return this.service.findAll(false);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Get('admin')
  findAllForAdmin(@Query() query: SubscriptionPlanQueryDto) {
    return this.service.findAll(query.includeInactive ?? true);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Post()
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
