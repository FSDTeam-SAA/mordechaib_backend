import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RevenueAcquisitionCost,
  RevenueAcquisitionCostSchema,
} from '../../database/schemas/revenue-acquisition-cost.schema';
import {
  AgentActivity,
  AgentActivitySchema,
} from '../../database/schemas/agent-activity.schema';
import {
  RevenueCostCursor,
  RevenueCostCursorSchema,
} from '../../database/schemas/revenue-cost-cursor.schema';
import {
  RevenueDailySnapshot,
  RevenueDailySnapshotSchema,
} from '../../database/schemas/revenue-daily-snapshot.schema';
import {
  RevenueMovement,
  RevenueMovementSchema,
} from '../../database/schemas/revenue-movement.schema';
import {
  RevenueOrganizationState,
  RevenueOrganizationStateSchema,
} from '../../database/schemas/revenue-organization-state.schema';
import {
  RevenueServiceCost,
  RevenueServiceCostSchema,
} from '../../database/schemas/revenue-service-cost.schema';
import { RevenueCostReconciliationService } from './revenue-cost-reconciliation.service';
import { RevenueCostRepository } from './revenue-cost.repository';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import { RevenueLifecycleService } from './revenue-lifecycle.service';
import { RevenueAnalyticsController } from './revenue-analytics.controller';
import { RevenueAnalyticsService } from './revenue-analytics.service';
import { RevenueRetentionService } from './revenue-retention.service';
import { RevenueUnitEconomicsService } from './revenue-unit-economics.service';
import { RevenueAcquisitionCostController } from './revenue-acquisition-cost.controller';
import { RevenueAcquisitionCostRepository } from './revenue-acquisition-cost.repository';
import { RevenueAcquisitionCostService } from './revenue-acquisition-cost.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RevenueAnalyticsReportService } from './revenue-analytics-report.service';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      {
        name: RevenueOrganizationState.name,
        schema: RevenueOrganizationStateSchema,
      },
      { name: RevenueMovement.name, schema: RevenueMovementSchema },
      {
        name: RevenueDailySnapshot.name,
        schema: RevenueDailySnapshotSchema,
      },
      { name: AgentActivity.name, schema: AgentActivitySchema },
      {
        name: RevenueServiceCost.name,
        schema: RevenueServiceCostSchema,
      },
      {
        name: RevenueCostCursor.name,
        schema: RevenueCostCursorSchema,
      },
      {
        name: RevenueAcquisitionCost.name,
        schema: RevenueAcquisitionCostSchema,
      },
    ]),
  ],
  controllers: [RevenueAnalyticsController, RevenueAcquisitionCostController],
  providers: [
    RevenueAnalyticsService,
    RevenueLifecycleRepository,
    RevenueLifecycleService,
    RevenueRetentionService,
    RevenueCostRepository,
    RevenueCostReconciliationService,
    RevenueUnitEconomicsService,
    RevenueAcquisitionCostRepository,
    RevenueAcquisitionCostService,
    RevenueAnalyticsReportService,
  ],
  exports: [RevenueAnalyticsService, RevenueLifecycleService],
})
export class RevenueAnalyticsModule {}
