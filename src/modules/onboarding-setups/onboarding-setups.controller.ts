import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { AddAdminNoteDto } from './dto/add-admin-note.dto';
import { AssignAdminDto } from './dto/assign-admin.dto';
import { BookSetupMeetingDto } from './dto/book-setup-meeting.dto';
import { ChangeSetupStatusDto } from './dto/change-setup-status.dto';
import { CreateOnboardingSetupDto } from './dto/create-onboarding-setup.dto';
import { OnboardingSetupQueryDto } from './dto/onboarding-setup-query.dto';
import { UpdateOnboardingSetupDto } from './dto/update-onboarding-setup.dto';
import { UpdateSetupPaymentDto } from './dto/update-setup-payment.dto';
import { UpdateSetupProgressDto } from './dto/update-setup-progress.dto';
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

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateOnboardingSetupDto,
  ) {
    return this.service.update(id, user, dto);
  }

  @Post(':id/book-meeting')
  bookMeeting(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: BookSetupMeetingDto,
  ) {
    return this.service.bookMeeting(id, user, dto);
  }

  @Patch(':id/payment')
  updatePaymentStatus(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSetupPaymentDto,
  ) {
    return this.service.updatePaymentStatus(id, user, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.cancel(id, user);
  }

  // ============================================================
  // Admin routes
  // ============================================================

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
  @Patch('admin/:id/status')
  adminChangeStatus(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangeSetupStatusDto,
  ) {
    return this.service.changeStatus(id, user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('admin/:id/progress')
  adminUpdateProgress(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSetupProgressDto,
  ) {
    return this.service.updateProgress(id, user, dto);
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