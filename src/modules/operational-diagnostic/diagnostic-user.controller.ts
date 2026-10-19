import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { SubmitDiagnosticAssessmentDto } from './dto/submit-diagnostic-assessment.dto';
import { ListDiagnosticAssessmentsUserQueryDto } from './dto/list-diagnostic-assessments-user-query.dto';
import { DiagnosticUserService } from './diagnostic-user.service';

@ApiTags('Operational Diagnostic (user)')
@ApiBearerAuth()
@Controller('diagnostic')
@UseGuards(OrganizationGuard)
export class DiagnosticUserController {
  constructor(private readonly service: DiagnosticUserService) {}

  @Get('questions')
  @ApiOperation({
    summary: 'Get all active questions grouped by category for the assessment',
  })
  getQuestionnaire() {
    return this.service.getQuestionnaire();
  }

  @Post('assessments')
  @ApiOperation({ summary: 'Submit assessment answers and receive a score' })
  submitAssessment(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitDiagnosticAssessmentDto,
  ) {
    return this.service.submitAssessment(org.id, user.id, dto);
  }

  @Get('assessments')
  @ApiOperation({ summary: "List current user's past assessments (paginated)" })
  listMyAssessments(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Query() query: ListDiagnosticAssessmentsUserQueryDto,
  ) {
    return this.service.listMyAssessments(org.id, user.id, query);
  }

  // NOTE: 'latest' must be declared before ':id' to avoid route conflicts
  @Get('assessments/latest')
  @ApiOperation({ summary: "Get the user's most recent assessment result" })
  getLatestAssessment(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getLatestAssessment(org.id, user.id);
  }

  @Get('assessments/:id')
  @ApiOperation({ summary: 'Get full detail of one of your own assessments' })
  getAssessmentDetail(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.service.getAssessmentDetail(org.id, user.id, id);
  }
}
