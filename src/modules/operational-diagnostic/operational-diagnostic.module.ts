import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DiagnosticCategory,
  DiagnosticCategorySchema,
} from '../../database/schemas/diagnostic-category.schema';
import {
  DiagnosticQuestion,
  DiagnosticQuestionSchema,
} from '../../database/schemas/diagnostic-question.schema';
import {
  DiagnosticAssessment,
  DiagnosticAssessmentSchema,
} from '../../database/schemas/diagnostic-assessment.schema';
import { DiagnosticCategoriesRepository } from './diagnostic-categories.repository';
import { DiagnosticQuestionsRepository } from './diagnostic-questions.repository';
import { DiagnosticAssessmentsRepository } from './diagnostic-assessments.repository';
import { DiagnosticAdminService } from './diagnostic-admin.service';
import { DiagnosticUserService } from './diagnostic-user.service';
import { DiagnosticAdminController } from './diagnostic-admin.controller';
import { DiagnosticUserController } from './diagnostic-user.controller';

// OrganizationGuard requires the Organization model to be available
import {
  Organization,
  OrganizationSchema,
} from '../../database/schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DiagnosticCategory.name, schema: DiagnosticCategorySchema },
      { name: DiagnosticQuestion.name, schema: DiagnosticQuestionSchema },
      { name: DiagnosticAssessment.name, schema: DiagnosticAssessmentSchema },
      // OrganizationGuard (used in DiagnosticUserController) needs this model
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [DiagnosticAdminController, DiagnosticUserController],
  providers: [
    DiagnosticCategoriesRepository,
    DiagnosticQuestionsRepository,
    DiagnosticAssessmentsRepository,
    DiagnosticAdminService,
    DiagnosticUserService,
  ],
  exports: [DiagnosticAdminService, DiagnosticUserService],
})
export class OperationalDiagnosticModule {}
