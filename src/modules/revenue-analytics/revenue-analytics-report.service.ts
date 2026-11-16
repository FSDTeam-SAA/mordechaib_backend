import { Injectable } from '@nestjs/common';
// @ts-ignore pdfkit does not publish types in the installed package.
import PDFDocument from 'pdfkit';
import { RevenueAnalyticsAvailability } from './revenue-analytics.enums';
import {
  RevenueMetricValueResponse,
  RevenueRetentionResponse,
} from './revenue-retention.types';
import {
  RevenueUnitEconomicsMetricResponse,
  RevenueUnitEconomicsResponse,
} from './revenue-unit-economics.types';

type PdfDocument = any;

export type RevenueAnalyticsReport = {
  buffer: Buffer;
  filename: string;
  generatedAt: string;
  hasEstimatedData: boolean;
};

@Injectable()
export class RevenueAnalyticsReportService {
  create(
    retention: RevenueRetentionResponse,
    unitEconomics: RevenueUnitEconomicsResponse,
  ): Promise<RevenueAnalyticsReport> {
    const generatedAt = new Date().toISOString();
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      info: {
        Title: 'Noltra Revenue & Analytics Report',
        Author: 'Noltra AI',
        Subject: 'Platform retention and unit economics',
        CreationDate: new Date(generatedAt),
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));

    this.title(document, retention, generatedAt);
    this.retentionSection(document, retention);
    this.unitEconomicsSection(document, unitEconomics);
    this.providerCostSection(document, unitEconomics);
    this.acquisitionSection(document, unitEconomics);
    this.coverageSection(document, retention, unitEconomics);
    this.disclosures(document, retention, unitEconomics);

    const filename = this.filename(retention.from, retention.to);
    const hasEstimatedData =
      retention.summary.some((metric) => metric.isEstimated) ||
      retention.lifetimeValueByPlan.some((plan) => plan.isEstimated) ||
      unitEconomics.summary.some((metric) => metric.isEstimated) ||
      unitEconomics.providerCosts.some((provider) => provider.isEstimated);

    return new Promise((resolve, reject) => {
      document.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          filename,
          generatedAt,
          hasEstimatedData,
        }),
      );
      document.on('error', reject);
      document.end();
    });
  }

  private title(
    document: PdfDocument,
    retention: RevenueRetentionResponse,
    generatedAt: string,
  ) {
    document
      .fontSize(22)
      .fillColor('#111827')
      .text('Noltra Revenue & Analytics Report', { align: 'center' })
      .moveDown(0.3)
      .fontSize(10)
      .fillColor('#667085')
      .text(
        `${retention.from.slice(0, 10)} to ${retention.to.slice(0, 10)} (exclusive) | ${retention.timezone}`,
        { align: 'center' },
      )
      .text(`Generated: ${generatedAt}`, { align: 'center' })
      .text(`Currency: ${retention.currency}`, { align: 'center' });
  }

  private retentionSection(
    document: PdfDocument,
    retention: RevenueRetentionResponse,
  ) {
    this.section(document, 'Churn & Retention');
    for (const metric of retention.summary) {
      this.metric(document, metric.label, this.metricValue(metric), metric);
    }

    if (retention.lifetimeValueByPlan.length > 0) {
      this.subsection(document, 'Realized lifetime value by plan');
      for (const plan of retention.lifetimeValueByPlan) {
        const value =
          plan.availability === RevenueAnalyticsAvailability.UNAVAILABLE ||
          plan.averageRealizedLtvUsd === null
            ? 'Unavailable'
            : `${this.money(plan.averageRealizedLtvUsd)} average across ${plan.organizationsWithPaidInvoices} organizations`;
        this.metric(document, plan.planName, value, plan);
      }
    }
  }

  private unitEconomicsSection(
    document: PdfDocument,
    unitEconomics: RevenueUnitEconomicsResponse,
  ) {
    this.section(document, 'Unit Economics');
    this.metric(
      document,
      'Paid revenue in period',
      this.money(unitEconomics.revenueUsd),
    );
    for (const metric of unitEconomics.summary) {
      this.metric(document, metric.label, this.metricValue(metric), metric);
    }
  }

  private providerCostSection(
    document: PdfDocument,
    unitEconomics: RevenueUnitEconomicsResponse,
  ) {
    this.section(document, 'Provider Service Costs');
    for (const provider of unitEconomics.providerCosts) {
      const value =
        provider.availability === RevenueAnalyticsAvailability.UNAVAILABLE ||
        provider.costUsd === null
          ? 'Unavailable'
          : `${this.money(provider.costUsd)} | ${provider.costAvailableEvents}/${provider.eventCount} costed events`;
      this.metric(document, provider.provider, value, provider);
    }
  }

  private acquisitionSection(
    document: PdfDocument,
    unitEconomics: RevenueUnitEconomicsResponse,
  ) {
    const acquisition = unitEconomics.acquisitionCosts;
    this.section(document, 'Sales & Marketing Acquisition Costs');
    if (acquisition.availability === RevenueAnalyticsAvailability.UNAVAILABLE) {
      document
        .fontSize(10)
        .fillColor('#667085')
        .text('Unavailable for the selected reporting period.');
      return;
    }

    this.metric(document, 'Sales cost', this.money(acquisition.salesCostUsd));
    this.metric(
      document,
      'Marketing cost',
      this.money(acquisition.marketingCostUsd),
    );
    this.metric(document, 'Total cost', this.money(acquisition.totalCostUsd));
    this.metric(
      document,
      'Newly acquired organizations',
      String(acquisition.newlyAcquiredOrganizations),
    );

    if (acquisition.channels.length > 0) {
      this.subsection(document, 'Channel breakdown');
      for (const channel of acquisition.channels) {
        this.metric(
          document,
          this.humanize(channel.channel),
          `${this.money(channel.totalCostUsd)} (sales ${this.money(channel.salesCostUsd)}, marketing ${this.money(channel.marketingCostUsd)})`,
        );
      }
    }
  }

  private coverageSection(
    document: PdfDocument,
    retention: RevenueRetentionResponse,
    unitEconomics: RevenueUnitEconomicsResponse,
  ) {
    this.section(document, 'Source Coverage');
    this.metric(
      document,
      'Opening organizations snapshotted',
      `${retention.coverage.snapshottedOpeningOrganizations}/${retention.coverage.expectedOpeningOrganizations}`,
    );
    this.metric(
      document,
      'Revenue lifecycle movements',
      String(retention.coverage.movements),
    );
    this.metric(
      document,
      'Provider cost events',
      `${unitEconomics.coverage.costAvailableEvents}/${unitEconomics.coverage.totalCostEvents}`,
    );
    this.metric(
      document,
      'Estimated provider cost events',
      String(unitEconomics.coverage.estimatedCostEvents),
    );
    this.metric(
      document,
      'Acquisition-cost month coverage',
      `${unitEconomics.acquisitionCosts.coveredMonths}/${unitEconomics.acquisitionCosts.expectedMonths}`,
    );
  }

  private disclosures(
    document: PdfDocument,
    retention: RevenueRetentionResponse,
    unitEconomics: RevenueUnitEconomicsResponse,
  ) {
    this.section(document, 'Methodology & Disclosures');
    document
      .fontSize(9)
      .fillColor('#475467')
      .text(`Methodology version: ${retention.methodologyVersion}`)
      .text('Period boundary: [from, to); the end timestamp is exclusive.')
      .text(
        'Subscription and billing records are read-only sources. This report does not modify plans, invoices, or subscriptions.',
      )
      .text(
        'Unavailable data is shown as unavailable and is never converted to zero. Partial data must not be interpreted as complete platform coverage.',
      )
      .text(
        'Values marked Estimated use configured provider pricing because authoritative provider cost telemetry was unavailable.',
      )
      .text(
        `Retention generated: ${retention.generatedAt}; unit economics generated: ${unitEconomics.generatedAt}.`,
      );
  }

  private section(document: PdfDocument, title: string) {
    this.ensureSpace(document, 80);
    document
      .moveDown(1.1)
      .fontSize(14)
      .fillColor('#111827')
      .text(title)
      .moveDown(0.35);
  }

  private subsection(document: PdfDocument, title: string) {
    this.ensureSpace(document, 55);
    document
      .moveDown(0.65)
      .fontSize(11)
      .fillColor('#344054')
      .text(title)
      .moveDown(0.25);
  }

  private metric(
    document: PdfDocument,
    label: string,
    value: string,
    disclosure?: {
      availability?: RevenueAnalyticsAvailability;
      isEstimated?: boolean;
    },
  ) {
    this.ensureSpace(document, 24);
    const qualifiers = [
      disclosure?.availability === RevenueAnalyticsAvailability.PARTIAL
        ? 'Partial'
        : null,
      disclosure?.isEstimated ? 'Estimated' : null,
    ].filter(Boolean);
    const displayValue =
      qualifiers.length > 0 ? `${value} (${qualifiers.join(', ')})` : value;

    document
      .fontSize(9.5)
      .fillColor('#667085')
      .text(label, { continued: true })
      .fillColor('#101828')
      .text(displayValue, { align: 'right' });
  }

  private metricValue(
    metric: RevenueMetricValueResponse | RevenueUnitEconomicsMetricResponse,
  ) {
    if (
      metric.availability === RevenueAnalyticsAvailability.UNAVAILABLE ||
      metric.value === null
    ) {
      return 'Unavailable';
    }
    const value = metric.value;
    switch (metric.unit) {
      case 'CURRENCY_USD':
        return this.money(value);
      case 'PERCENT':
        return `${value.toFixed(2)}%`;
      case 'MONTH':
        return `${value.toFixed(2)} months`;
      case 'RATIO':
        return `${value.toFixed(2)}x`;
      default:
        return String(value);
    }
  }

  private ensureSpace(document: PdfDocument, requiredHeight: number) {
    const bottom = document.page.height - document.page.margins.bottom;
    if (document.y + requiredHeight > bottom) {
      document.addPage();
    }
  }

  private money(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private humanize(value: string) {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private filename(from: string, to: string) {
    return `noltra-revenue-analytics-${from.slice(0, 10)}-to-${to.slice(0, 10)}.pdf`;
  }
}
