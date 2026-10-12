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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CreateDiagnosticCategoryDto } from './dto/create-diagnostic-category.dto';
import { UpdateDiagnosticCategoryDto } from './dto/update-diagnostic-category.dto';
import { CreateDiagnosticQuestionDto } from './dto/create-diagnostic-question.dto';
import { BulkCreateDiagnosticQuestionsDto } from './dto/bulk-create-diagnostic-questions.dto';
import { UpdateDiagnosticQuestionDto } from './dto/update-diagnostic-question.dto';
import { ListDiagnosticQuestionsQueryDto } from './dto/list-diagnostic-questions-query.dto';
import { ListDiagnosticAssessmentsAdminQueryDto } from './dto/list-diagnostic-assessments-admin-query.dto';
import { DiagnosticAdminService } from './diagnostic-admin.service';

@ApiTags('Operational Diagnostic (admin)')
@ApiBearerAuth()
@Controller('diagnostic-admin')
@UseGuards(PlatformAdminGuard)
export class DiagnosticAdminController {
  constructor(private readonly service: DiagnosticAdminService) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  @Post('categories')
  @ApiOperation({ summary: 'Create a diagnostic category / heading' })
  createCategory(@Body() dto: CreateDiagnosticCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all categories with their questions' })
  listCategories() {
    return this.service.listCategories();
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update a diagnostic category' })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateDiagnosticCategoryDto,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a diagnostic category (must have no questions)' })
  deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(id);
  }

  // ─── Questions ─────────────────────────────────────────────────────────────

  @Post('questions')
  @ApiOperation({ summary: 'Create a diagnostic question with choices' })
  createQuestion(@Body() dto: CreateDiagnosticQuestionDto) {
    return this.service.createQuestion(dto);
  }

  @Post('questions/bulk')
  @ApiOperation({ summary: 'Create multiple diagnostic questions at once' })
  createQuestionsBulk(@Body() dto: BulkCreateDiagnosticQuestionsDto) {
    return this.service.createQuestionsBulk(dto);
  }

  @Get('questions')
  @ApiOperation({
    summary: 'List diagnostic questions with pagination and filtering',
  })
  listQuestions(@Query() query: ListDiagnosticQuestionsQueryDto) {
    return this.service.listQuestions(query);
  }

  @Get('questions/:id')
  @ApiOperation({ summary: 'Get a single diagnostic question' })
  getQuestion(@Param('id') id: string) {
    return this.service.getQuestion(id);
  }

  @Patch('questions/:id')
  @ApiOperation({ summary: 'Update a diagnostic question and its choices' })
  updateQuestion(
    @Param('id') id: string,
    @Body() dto: UpdateDiagnosticQuestionDto,
  ) {
    return this.service.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @ApiOperation({ summary: 'Delete a diagnostic question' })
  deleteQuestion(@Param('id') id: string) {
    return this.service.deleteQuestion(id);
  }

  // ─── Assessment Results ────────────────────────────────────────────────────

  @Get('assessments')
  @ApiOperation({
    summary: 'List all assessment results across all organizations',
  })
  listAssessments(@Query() query: ListDiagnosticAssessmentsAdminQueryDto) {
    return this.service.listAssessments(query);
  }

  @Get('assessments/:id')
  @ApiOperation({
    summary: 'Get full assessment detail including all answers and scores',
  })
  getAssessmentDetail(@Param('id') id: string) {
    return this.service.getAssessmentDetail(id);
  }
}

