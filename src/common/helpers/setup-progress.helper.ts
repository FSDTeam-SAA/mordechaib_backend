import { IntegrationSetupStatus } from '../enums/integration-setup-status.enum';

type ProgressSection = {
  status: IntegrationSetupStatus;
  note?: string;
  completedAt?: Date;
};

type ProgressInput = {
  overallProgress: number;
  crmSetup: ProgressSection;
  calendarSetup: ProgressSection;
  twilioSetup: ProgressSection;
  aiAgentSetup: ProgressSection;
  workflowSetup: ProgressSection;
  teamOnboarding: ProgressSection;
};

const SECTION_KEYS = [
  'crmSetup',
  'calendarSetup',
  'twilioSetup',
  'aiAgentSetup',
  'workflowSetup',
  'teamOnboarding',
] as const;

const STATUS_WEIGHTS: Record<IntegrationSetupStatus, number> = {
  [IntegrationSetupStatus.PENDING]: 0,
  [IntegrationSetupStatus.IN_PROGRESS]: 0.5,
  [IntegrationSetupStatus.COMPLETED]: 1,
  [IntegrationSetupStatus.FAILED]: 0,
  [IntegrationSetupStatus.SKIPPED]: 1,
};

export class SetupProgressHelper {
  static computeOverallProgress(progress: ProgressInput): number {
    const completedWeight = SECTION_KEYS.reduce((total, key) => {
      return total + STATUS_WEIGHTS[progress[key].status];
    }, 0);

    return Math.round((completedWeight / SECTION_KEYS.length) * 100);
  }

  static isSetupComplete(progress: ProgressInput): boolean {
    return SetupProgressHelper.computeOverallProgress(progress) === 100;
  }

  static buildCompletedSection(
    note?: string,
  ): ProgressSection & { completedAt: Date } {
    return {
      status: IntegrationSetupStatus.COMPLETED,
      note,
      completedAt: new Date(),
    };
  }
}