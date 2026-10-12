import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiagnosticCategoriesRepository } from './diagnostic-categories.repository';
import { DiagnosticQuestionsRepository } from './diagnostic-questions.repository';
import { DiagnosticAssessmentsRepository } from './diagnostic-assessments.repository';
import { CreateDiagnosticCategoryDto } from './dto/create-diagnostic-category.dto';
import { UpdateDiagnosticCategoryDto } from './dto/update-diagnostic-category.dto';
import { CreateDiagnosticQuestionDto } from './dto/create-diagnostic-question.dto';
import { BulkCreateDiagnosticQuestionsDto } from './dto/bulk-create-diagnostic-questions.dto';
import { UpdateDiagnosticQuestionDto } from './dto/update-diagnostic-question.dto';
import { ListDiagnosticQuestionsQueryDto } from './dto/list-diagnostic-questions-query.dto';
import { ListDiagnosticAssessmentsAdminQueryDto } from './dto/list-diagnostic-assessments-admin-query.dto';

@Injectable()
export class DiagnosticAdminService {
  constructor(
    private readonly categoriesRepo: DiagnosticCategoriesRepository,
    private readonly questionsRepo: DiagnosticQuestionsRepository,
    private readonly assessmentsRepo: DiagnosticAssessmentsRepository,
  ) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  createCategory(dto: CreateDiagnosticCategoryDto) {
    return this.categoriesRepo.create(dto);
  }

  async listCategories() {
    const categories = await this.categoriesRepo.findAll(true);
    const questions = await this.questionsRepo.findAllActive();

    const questionsByCategoryId = new Map<string, typeof questions>();
    for (const q of questions) {
      const catId = String(q.categoryId);
      if (!questionsByCategoryId.has(catId)) {
        questionsByCategoryId.set(catId, []);
      }
      questionsByCategoryId.get(catId)!.push(q);
    }

    return categories.map((cat) => ({
      ...cat,
      id: String((cat as unknown as { _id: unknown })._id),
      questions: questionsByCategoryId.get(String((cat as unknown as { _id: unknown })._id)) ?? [],
    }));
  }

  async updateCategory(id: string, dto: UpdateDiagnosticCategoryDto) {
    const updated = await this.categoriesRepo.updateById(id, dto);
    if (!updated) throw new NotFoundException('Category not found');
    return updated;
  }

  async deleteCategory(id: string) {
    const existing = await this.categoriesRepo.findById(id);
    if (!existing) throw new NotFoundException('Category not found');

    const questionCount = await this.questionsRepo.countByCategoryId(id);
    if (questionCount > 0) {
      throw new BadRequestException(
        'Cannot delete a category that has questions. Delete or reassign the questions first.',
      );
    }

    await this.categoriesRepo.deleteById(id);
    return { id, deleted: true };
  }

  // ─── Questions ─────────────────────────────────────────────────────────────

  async createQuestion(dto: CreateDiagnosticQuestionDto) {
    const category = await this.categoriesRepo.findById(dto.categoryId);
    if (!category) throw new NotFoundException('Category not found');
    return this.questionsRepo.create(dto);
  }

  async createQuestionsBulk(dto: BulkCreateDiagnosticQuestionsDto) {
    if (!dto.questions.length) {
      throw new BadRequestException('At least one question is required');
    }
    const categoryIds = [...new Set(dto.questions.map((q) => q.categoryId))];
    for (const catId of categoryIds) {
      const category = await this.categoriesRepo.findById(catId);
      if (!category) throw new NotFoundException(`Category not found: ${catId}`);
    }
    return this.questionsRepo.createMany(dto.questions);
  }

  async listQuestions(query: ListDiagnosticQuestionsQueryDto) {
    return this.questionsRepo.list(query.page, query.limit, {
      categoryId: query.categoryId,
      search: query.search?.trim(),
      isActive: query.isActive,
    });
  }

  async getQuestion(id: string) {
    const question = await this.questionsRepo.findById(id);
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  async updateQuestion(id: string, dto: UpdateDiagnosticQuestionDto) {
    if (dto.categoryId) {
      const category = await this.categoriesRepo.findById(dto.categoryId);
      if (!category) throw new NotFoundException('Category not found');
    }
    const updated = await this.questionsRepo.updateById(id, dto);
    if (!updated) throw new NotFoundException('Question not found');
    return updated;
  }

  async deleteQuestion(id: string) {
    const deleted = await this.questionsRepo.deleteById(id);
    if (!deleted) throw new NotFoundException('Question not found');
    return { id, deleted: true };
  }

  // ─── Assessment Results ────────────────────────────────────────────────────

  async listAssessments(query: ListDiagnosticAssessmentsAdminQueryDto) {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    return this.assessmentsRepo.listForAdmin(query.page, query.limit, {
      organizationId: query.organizationId,
      userId: query.userId,
      dateFrom,
      dateTo,
    });
  }

  async getAssessmentDetail(id: string) {
    const assessment = await this.assessmentsRepo.findById(id);
    if (!assessment) throw new NotFoundException('Assessment not found');

    // Enrich answers with question and category text
    const questionIds = assessment.answers.map((a) => a.questionId);
    const questions =
      questionIds.length > 0
        ? await this.questionsRepo.findByIds(questionIds)
        : [];

    const questionMap = new Map(
      questions.map((q) => [String((q as unknown as { _id: unknown })._id), q]),
    );

    const categoryIds = [...new Set(assessment.answers.map((a) => a.categoryId))];
    const categories =
      categoryIds.length > 0
        ? await this.categoriesRepo.findAll(true)
        : [];

    const categoryMap = new Map(
      categories.map((c) => [String((c as unknown as { _id: unknown })._id), c]),
    );

    const enrichedAnswers = assessment.answers.map((answer) => {
      const question = questionMap.get(answer.questionId);
      const category = categoryMap.get(answer.categoryId);
      const selectedChoice = question?.choices?.find(
        (c) => c.label === answer.selectedChoiceLabel,
      );
      return {
        questionId: answer.questionId,
        categoryId: answer.categoryId,
        categoryTitle: category?.title ?? null,
        questionTitle: question?.title ?? null,
        selectedChoiceLabel: answer.selectedChoiceLabel,
        selectedChoiceText: selectedChoice?.text ?? null,
        pointsAwarded: answer.pointsAwarded,
      };
    });

    return {
      ...assessment,
      id: String((assessment as unknown as { _id: unknown })._id),
      answers: enrichedAnswers,
    };
  }
}

