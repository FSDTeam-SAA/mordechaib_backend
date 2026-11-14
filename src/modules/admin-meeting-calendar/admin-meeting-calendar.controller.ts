import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminMeetingSourceType } from '../../common/enums/admin-meeting-status.enum';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { AdminMeetingCalendarActionsService } from './admin-meeting-calendar-actions.service';
import { AdminMeetingCalendarQuickActionsService } from './admin-meeting-calendar-quick-actions.service';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';
import {
  AdminMeetingCalendarActionResponse,
  AdminMeetingCalendarResponse,
  AdminCalendarSyncResponse,
  AdminScheduledMeetingResponse,
} from './admin-meeting-calendar.types';
import { AdminMeetingCalendarQueryDto } from './dto/admin-meeting-calendar-query.dto';
import { AdminScheduleMeetingDto } from './dto/admin-schedule-meeting.dto';
import { AdminSyncCalendarDto } from './dto/admin-sync-calendar.dto';

@ApiTags('Meeting Calendar (platform admin)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@ApiForbiddenResponse({ description: 'Platform admin access is required.' })
@Controller('platform/meeting-calendar')
@UseGuards(PlatformAdminGuard)
export class AdminMeetingCalendarController {
  constructor(
    private readonly calendar: AdminMeetingCalendarService,
    private readonly actions: AdminMeetingCalendarActionsService,
    private readonly quickActions: AdminMeetingCalendarQuickActionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the cross-organization platform meeting calendar',
    description:
      'Returns deduplicated platform meetings and synchronized calendar events, stable summary cards, meeting-type breakdown, upcoming meetings, and a filtered paginated list.',
  })
  @ApiOkResponse({ type: AdminMeetingCalendarResponse })
  dashboard(@Query() query: AdminMeetingCalendarQueryDto) {
    return this.calendar.dashboard(query);
  }

  @Post('meetings')
  @ApiOperation({
    summary: 'Schedule a meeting for a target organization',
    description:
      'Validates the selected organizer as an active OWNER or ADMIN in the target organization, then reuses the standard provider-backed meeting workflow.',
  })
  @ApiBody({ type: AdminScheduleMeetingDto })
  @ApiCreatedResponse({ type: AdminScheduledMeetingResponse })
  @ApiBadRequestResponse({ description: 'The meeting request is invalid.' })
  @ApiNotFoundResponse({
    description: 'An eligible organizer was not found in the organization.',
  })
  @ApiConflictResponse({
    description: 'An equivalent operation is already in progress.',
  })
  @ApiServiceUnavailableResponse({
    description: 'The connected meeting provider is unavailable.',
  })
  schedule(
    @CurrentUser() user: RequestUser,
    @Body() input: AdminScheduleMeetingDto,
  ) {
    return this.quickActions.schedule(user, input);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Synchronize connected calendars for a target organization',
    description:
      'Validates the selected target-organization organizer and reuses the standard idempotent Google/Outlook synchronization workflow.',
  })
  @ApiBody({ type: AdminSyncCalendarDto })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminCalendarSyncResponse })
  @ApiBadRequestResponse({
    description: 'The synchronization range is invalid.',
  })
  @ApiNotFoundResponse({
    description: 'An eligible organizer was not found in the organization.',
  })
  @ApiConflictResponse({
    description: 'A calendar sync is already running for the organization.',
  })
  @ApiServiceUnavailableResponse({
    description: 'No selected calendar could be synchronized.',
  })
  sync(@CurrentUser() user: RequestUser, @Body() input: AdminSyncCalendarDto) {
    return this.quickActions.sync(user, input);
  }

  @Post(':sourceType/:id/complete')
  @ApiOperation({
    summary: 'Complete an eligible platform meeting',
    description:
      'A platform meeting becomes eligible after its scheduled start time. Synchronized provider-only calendar events derive completion from provider/time state and cannot be manually completed.',
  })
  @ApiParam({ name: 'sourceType', enum: AdminMeetingSourceType })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminMeetingCalendarActionResponse })
  @ApiNotFoundResponse({ description: 'Meeting calendar item not found.' })
  @ApiConflictResponse({
    description: 'The transition is invalid or another action is in progress.',
  })
  complete(
    @CurrentUser() user: RequestUser,
    @Param('sourceType', new ParseEnumPipe(AdminMeetingSourceType))
    sourceType: AdminMeetingSourceType,
    @Param('id') id: string,
  ) {
    return this.actions.complete(user, sourceType, id);
  }

  @Post(':sourceType/:id/cancel')
  @ApiOperation({
    summary: 'Cancel an eligible meeting or synchronized calendar event',
    description:
      'Cancels the provider resource before persisting the cancelled state. Linked platform meetings remain the authoritative action target after deduplication.',
  })
  @ApiParam({ name: 'sourceType', enum: AdminMeetingSourceType })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminMeetingCalendarActionResponse })
  @ApiNotFoundResponse({ description: 'Meeting calendar item not found.' })
  @ApiConflictResponse({
    description: 'The transition is invalid or another action is in progress.',
  })
  @ApiServiceUnavailableResponse({
    description: 'The provider resource could not be fully cancelled.',
  })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('sourceType', new ParseEnumPipe(AdminMeetingSourceType))
    sourceType: AdminMeetingSourceType,
    @Param('id') id: string,
  ) {
    return this.actions.cancel(user, sourceType, id);
  }

  @Delete(':sourceType/:id')
  @ApiOperation({
    summary: 'Permanently delete an eligible terminal platform meeting',
    description:
      'Only completed, cancelled, or failed platform meeting records can be deleted. Provider-only synchronized calendar events are retained for synchronization integrity.',
  })
  @ApiParam({ name: 'sourceType', enum: AdminMeetingSourceType })
  @ApiOkResponse({ type: AdminMeetingCalendarActionResponse })
  @ApiNotFoundResponse({ description: 'Meeting calendar item not found.' })
  @ApiConflictResponse({
    description: 'The item is not terminal or another action is in progress.',
  })
  delete(
    @CurrentUser() user: RequestUser,
    @Param('sourceType', new ParseEnumPipe(AdminMeetingSourceType))
    sourceType: AdminMeetingSourceType,
    @Param('id') id: string,
  ) {
    return this.actions.delete(user, sourceType, id);
  }
}
