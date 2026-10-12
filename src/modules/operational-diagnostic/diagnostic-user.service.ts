import { Injectable, NotFoundException } from '@nestjs/common';
import { DiagnosticCategoriesRepository } from './diagnostic-categories.repository';
import { DiagnosticQuestionsRepository } from './diagnostic-questions.repository';
import { DiagnosticAssessmentsRepository } from './diagnostic-assessments.repository';
import { SubmitDiagnosticAssessmentDto } from './dto/submit-diagnostic-assessment.dto';
import { ListDiagnosticAssessmentsUserQueryDto } from './dto/list-diagnostic-assessments-user-query.dto';
import { DiagnosticAssessmentStatus } from '../../database/schemas/diagnostic-assessment.schema';

@Injectable()
export class DiagnosticUserService {
  constructor(
    private readonly categoriesRepo: DiagnosticCategoriesRepository,
    private readonly questionsRepo: DiagnosticQuestionsRepository,
    private readonly assessmentsRepo: DiagnosticAssessmentsRepository,
  ) {}

  /**
   * Returns all active questions grouped by their category for rendering
   * the multi-step assessment wizard on the frontend.
   */
  async getQuestionnaire() {
    const categories = await this.categoriesRepo.findAll(false);
    const questions = await this.questionsRepo.findAllActive();

    const questionsByCategoryId = new Map<string, typeof questions>();
    for (const q of questions) {
      const catId = String(q.categoryId);
      if (!questionsByCategoryId.has(catId)) {
        questionsByCategoryId.set(catId, []);
      }
      questionsByCategoryId.get(catId)!.push(q);
    }

    const grouped = categories
      .map((cat) => {
        const catId = String((cat as unknown as { _id: unknown })._id);
        return {
          id: catId,
          title: cat.title,
          order: cat.order,
          questions: (questionsByCategoryId.get(catId) ?? []).map((q) => ({
            id: String((q as unknown as { _id: unknown })._id),
            title: q.title,
            description: q.description,
            order: q.order,
            choices: q.choices,
          })),
        };
      })
      .filter((cat) => cat.questions.length > 0);

    const totalQuestions = grouped.reduce(
      (sum, cat) => sum + cat.questions.length,
      0,
    );

    return { categories: grouped, totalQuestions };
  }

  /**
   * Scores and saves a completed assessment.
   * Each question's max-point choice is used to compute the max possible score.
   */
  async submitAssessment(
    organizationId: string,
    userId: string,
    dto: SubmitDiagnosticAssessmentDto,
  ) {
    const questionIds = dto.answers.map((a) => a.questionId);
    const questions = await this.questionsRepo.findByIds(questionIds);

    const questionMap = new Map(
      questions.map((q) => [String((q as unknown as { _id: unknown })._id), q]),
    );

    let totalScore = 0;
    let maxPossibleScore = 0;
    let questionsAnswered = 0;

    const answers = dto.answers.map((answer) => {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        return {
          questionId: answer.questionId,
          categoryId: '',
          selectedChoiceLabel: answer.selectedChoiceLabel,
          pointsAwarded: 0,
        };
      }

      const choice = question.choices.find(
        (c) => c.label === answer.selectedChoiceLabel,
      );
      const pointsAwarded = choice?.points ?? 0;
      const maxPoints = question.choices.length
        ? Math.max(...question.choices.map((c) => c.points))
        : 0;

      totalScore += pointsAwarded;
      maxPossibleScore += maxPoints;
      questionsAnswered++;

      return {
        questionId: answer.questionId,
        categoryId: question.categoryId,
        selectedChoiceLabel: answer.selectedChoiceLabel,
        pointsAwarded,
      };
    });

    const assessment = await this.assessmentsRepo.create({
      organizationId,
      userId,
      answers,
      totalScore,
      maxPossibleScore,
      questionsAnswered,
      totalQuestions: questions.length,
      completedAt: new Date(),
      status: DiagnosticAssessmentStatus.COMPLETED,
    });

    return {
      id: String((assessment as unknown as { _id: unknown })._id),
      totalScore,
      maxPossibleScore,
      questionsAnswered,
      totalQuestions: questions.length,
      completedAt: assessment.completedAt,
      status: assessment.status,
    };
  }

  async listMyAssessments(
    organizationId: string,
    userId: string,
    query: ListDiagnosticAssessmentsUserQueryDto,
  ) {
    return this.assessmentsRepo.listForUser(
      organizationId,
      userId,
      query.page,
      query.limit,
    );
  }

  async getLatestAssessment(organizationId: string, userId: string) {
    const assessment = await this.assessmentsRepo.findLatestForUser(
      organizationId,
      userId,
    );
    if (!assessment) throw new NotFoundException('No assessment found');
    return this.enrichAssessment(assessment);
  }

  async getAssessmentDetail(
    organizationId: string,
    userId: string,
    id: string,
  ) {
    const assessment = await this.assessmentsRepo.findByIdAndUser(
      id,
      organizationId,
      userId,
    );
    if (!assessment) throw new NotFoundException('Assessment not found');
    return this.enrichAssessment(assessment);
  }

  /**
   * Enriches an assessment with full question, category, and choice text
   * so the frontend can render the full report without additional requests.
   */
  private async enrichAssessment(assessment: Record<string, unknown>) {
    const answers = assessment.answers as Array<{
      questionId: string;
      categoryId: string;
      selectedChoiceLabel: string;
      pointsAwarded: number;
    }>;

    const questionIds = answers.map((a) => a.questionId);
    const questions =
      questionIds.length > 0
        ? await this.questionsRepo.findByIds(questionIds)
        : [];

    const questionMap = new Map(
      questions.map((q) => [String((q as unknown as { _id: unknown })._id), q]),
    );

    const categoryIds = [...new Set(answers.map((a) => a.categoryId))];
    const allCategories = await this.categoriesRepo.findAll(true);
    const categoryMap = new Map(
      allCategories.map((c) => [
        String((c as unknown as { _id: unknown })._id),
        c,
      ]),
    );

    const enrichedAnswers = answers.map((answer) => {
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
        questionDescription: question?.description ?? null,
        selectedChoiceLabel: answer.selectedChoiceLabel,
        selectedChoiceText: selectedChoice?.text ?? null,
        pointsAwarded: answer.pointsAwarded,
        allChoices: question?.choices ?? [],
      };
    });

    // Group enriched answers by category for the report
    const byCategory = new Map<string, typeof enrichedAnswers>();
    for (const a of enrichedAnswers) {
      if (!byCategory.has(a.categoryId)) byCategory.set(a.categoryId, []);
      byCategory.get(a.categoryId)!.push(a);
    }

    const answersByCategory = categoryIds.map((catId) => ({
      categoryId: catId,
      categoryTitle: categoryMap.get(catId)?.title ?? null,
      answers: byCategory.get(catId) ?? [],
    }));

    return {
      id: String((assessment as unknown as { _id: unknown })._id),
      organizationId: assessment.organizationId,
      userId: assessment.userId,
      totalScore: assessment.totalScore,
      maxPossibleScore: assessment.maxPossibleScore,
      questionsAnswered: assessment.questionsAnswered,
      totalQuestions: assessment.totalQuestions,
      completedAt: assessment.completedAt,
      status: assessment.status,
      createdAt: assessment.createdAt,
      answersByCategory,
    };
  }
}

