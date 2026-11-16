import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  RevenueAnalyticsAvailability,
  RevenueCostPricingSource,
  RevenueServiceProvider,
} from './revenue-analytics.enums';
import { RevenueCostRepository } from './revenue-cost.repository';
import {
  RevenueCostCursorRecord,
  RevenueCostSourceRecord,
  RevenueServiceCostRecord,
} from './revenue-cost.types';

const BATCH_SIZE = 250;

type ProviderDefinition = {
  provider: RevenueServiceProvider;
  fallbackConfigKey: string;
  list: (
    cursor: RevenueCostCursorRecord | undefined,
    limit: number,
  ) => Promise<RevenueCostSourceRecord[]>;
};

@Injectable()
export class RevenueCostReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(RevenueCostReconciliationService.name);
  private running?: Promise<number>;

  constructor(
    private readonly repository: RevenueCostRepository,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.reconcile().catch((error) =>
      this.logger.warn(
        `Initial provider-cost reconciliation failed: ${String(error)}`,
      ),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledReconciliation() {
    await this.reconcile().catch((error) =>
      this.logger.error('Scheduled provider-cost reconciliation failed', error),
    );
  }

  reconcile() {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async run() {
    let processed = 0;
    for (const definition of this.providers()) {
      processed += await this.reconcileProvider(definition);
    }
    return processed;
  }

  private async reconcileProvider(definition: ProviderDefinition) {
    const fallbackRate = this.config.get<number>(definition.fallbackConfigKey);
    await this.repository.repriceFallbackCosts(
      definition.provider,
      fallbackRate,
    );
    let cursor = await this.repository.cursor(definition.provider);
    let processed = 0;
    for (;;) {
      const sources = await definition.list(cursor, BATCH_SIZE);
      if (sources.length === 0) break;
      const events = sources.map((source) =>
        this.costEvent(definition.provider, source, fallbackRate),
      );
      const last = sources[sources.length - 1];
      cursor = {
        lastUpdatedAt: last.updatedAt,
        lastSourceObjectId: last.id,
      };
      await this.repository.persistBatch(definition.provider, events, cursor);
      processed += sources.length;
      if (sources.length < BATCH_SIZE) break;
    }
    return processed;
  }

  private costEvent(
    provider: RevenueServiceProvider,
    source: RevenueCostSourceRecord,
    fallbackRate: number | undefined,
  ): RevenueServiceCostRecord {
    const measuredCost =
      provider === RevenueServiceProvider.AI
        ? source.providerCostUsd
        : undefined;
    const fallbackCost =
      fallbackRate === undefined
        ? undefined
        : provider === RevenueServiceProvider.AI
          ? fallbackRate
          : provider === RevenueServiceProvider.TWILIO
            ? (source.quantity / 60) * fallbackRate
            : source.quantity * fallbackRate;
    const costUsd = measuredCost ?? fallbackCost;
    const pricingSource =
      measuredCost !== undefined
        ? RevenueCostPricingSource.PROVIDER_REPORTED
        : fallbackCost !== undefined
          ? RevenueCostPricingSource.CONFIGURED_FALLBACK
          : RevenueCostPricingSource.UNAVAILABLE;

    return {
      dedupeKey: createHash('sha256')
        .update(`${provider}:${source.id}`)
        .digest('hex'),
      organizationId: source.organizationId,
      provider,
      sourceType: source.sourceType,
      sourceId: source.id,
      quantity: source.quantity,
      unit: source.unit,
      inputTokens: source.inputTokens,
      outputTokens: source.outputTokens,
      model: source.model,
      costUsd: costUsd === undefined ? undefined : this.money(costUsd),
      fallbackRateUsd:
        pricingSource === RevenueCostPricingSource.CONFIGURED_FALLBACK
          ? fallbackRate
          : undefined,
      isEstimated:
        pricingSource === RevenueCostPricingSource.CONFIGURED_FALLBACK,
      pricingSource,
      availability:
        costUsd === undefined
          ? RevenueAnalyticsAvailability.UNAVAILABLE
          : RevenueAnalyticsAvailability.AVAILABLE,
      occurredAt: source.occurredAt,
    };
  }

  private providers(): ProviderDefinition[] {
    return [
      {
        provider: RevenueServiceProvider.AI,
        fallbackConfigKey: 'revenueAnalytics.aiFallbackCostPerOperationUsd',
        list: (cursor, limit) => this.repository.listAiSources(cursor, limit),
      },
      {
        provider: RevenueServiceProvider.TWILIO,
        fallbackConfigKey: 'revenueAnalytics.twilioFallbackCostPerMinuteUsd',
        list: (cursor, limit) =>
          this.repository.listTwilioSources(cursor, limit),
      },
      {
        provider: RevenueServiceProvider.RECALL,
        fallbackConfigKey: 'revenueAnalytics.recallFallbackCostPerMinuteUsd',
        list: (cursor, limit) =>
          this.repository.listRecallSources(cursor, limit),
      },
    ];
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  }
}
