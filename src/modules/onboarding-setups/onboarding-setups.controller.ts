import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { AddAdminNoteDto } from './dto/add-admin-note.dto';
import { AssignAdminDto } from './dto/assign-admin.dto';
import { BookSetupMeetingDto } from './dto/book-setup-meeting.dto';
import { CreateOnboardingSetupDto } from './dto/create-onboarding-setup.dto';
import { CreateOnboardingPaymentSessionDto } from './dto/create-onboarding-payment-session.dto';
import { OnboardingSetupQueryDto } from './dto/onboarding-setup-query.dto';
import { OnboardingAvailableSlotsQueryDto } from './dto/onboarding-available-slots-query.dto';
import { UpsertOnboardingAvailabilityDto } from './dto/upsert-onboarding-availability.dto';
import { OnboardingSetupsService } from './onboarding-setups.service';

@ApiTags('Onboarding setups')
@ApiBearerAuth()
@Controller('onboarding-setups')
export class OnboardingSetupsController {
  constructor(private readonly service: OnboardingSetupsService) {}

  // ============================================================
  // Organizer routes
  // ============================================================

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOnboardingSetupDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get('my')
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Get onboarding meeting availability rules' })
  getAvailability() {
    return this.service.getAvailability();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Get(':id/available-slots')
  @ApiOperation({ summary: 'Get dynamic available slots for a selected date' })
  availableSlots(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: OnboardingAvailableSlotsQueryDto,
  ) {
    return this.service.getAvailableSlots(id, user, query);
  }

  @Post(':id/book-meeting')
  bookMeeting(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: BookSetupMeetingDto,
  ) {
    return this.service.bookMeeting(id, user, dto);
  }

  @Post(':id/payment/checkout-session')
  createPaymentCheckoutSession(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOnboardingPaymentSessionDto,
  ) {
    return this.service.createPaymentCheckoutSession(id, user, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.cancel(id, user);
  }

  // ============================================================
  // Admin routes
  // ============================================================

  @UseGuards(PlatformAdminGuard)
  @Get('admin/availability')
  @ApiOperation({ summary: 'Get platform onboarding availability settings' })
  adminGetAvailability() {
    return this.service.getAdminAvailability();
  }

  @UseGuards(PlatformAdminGuard)
  @Put('admin/availability')
  @ApiOperation({ summary: 'Create or replace onboarding availability settings' })
  adminUpsertAvailability(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpsertOnboardingAvailabilityDto,
  ) {
    return this.service.upsertAdminAvailability(dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Get('admin/list')
  adminFindAll(@Query() query: OnboardingSetupQueryDto) {
    return this.service.adminFindAll(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Get('admin/:id')
  adminFindOne(@Param('id') id: string) {
    return this.service.adminFindById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('admin/:id/assign-admin')
  adminAssign(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignAdminDto,
  ) {
    return this.service.assignAdmin(id, user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('admin/:id/notes')
  adminAddNote(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AddAdminNoteDto,
  ) {
    return this.service.addAdminNote(id, user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('admin/:id/complete')
  adminComplete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.complete(id, user);
  }
}
