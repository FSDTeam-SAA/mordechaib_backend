import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { RoiDashboardSnapshot } from './roi-dashboard.types';

@Injectable()
export class RoiReportService {
  create(snapshot: RoiDashboardSnapshot): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      info: {
        Title: `ROI Report - ${snapshot.organization.name}`,
        Author: 'Noltra AI',
        Subject: 'Organization automation ROI report',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));

    document
      .fontSize(22)
      .fillColor('#111827')
      .text('Noltra ROI Report', { align: 'center' });
    document
      .moveDown(0.25)
      .fontSize(11)
      .fillColor('#667085')
      .text(snapshot.organization.name, { align: 'center' })
      .text(
        `${snapshot.range.days} Days | ${snapshot.range.start.slice(0, 10)} to ${snapshot.range.end.slice(0, 10)} | ${snapshot.timezone}`,
        { align: 'center' },
      )
      .text(`Generated: ${snapshot.asOf}`, { align: 'center' });

    this.section(document, 'Executive Summary');
    const cards = snapshot.cards as Record<string, Record<string, unknown>>;
    this.metric(
      document,
      'Tasks automated',
      String(cards.tasksAutomated?.total ?? 0),
    );
    this.metric(
      document,
      'Meetings auto-scheduled',
      String(cards.meetingsAutoScheduled?.total ?? 0),
    );
    this.metric(
      document,
      'Estimated hours saved',
      String(cards.hoursSaved?.value ?? 0),
    );
    this.metric(
      document,
      'Estimated money saved',
      this.money(
        Number(cards.moneySaved?.amount || 0),
        String(cards.moneySaved?.currency || 'USD'),
      ),
    );

    this.section(document, 'Savings by Category');
    for (const item of snapshot.timeSavedByCategory) {
      const category = item as Record<string, unknown>;
      if (category.availability !== 'AVAILABLE') {
        this.metric(document, String(category.label), 'Unavailable');
        continue;
      }
      this.metric(
        document,
        String(category.label),
        `${category.count} actions | ${category.hoursSaved} hours | ${this.money(
          Number(category.moneySaved || 0),
          String(category.currency || 'USD'),
        )}`,
      );
    }

    this.section(document, 'Next 30 Days Projection');
    const projection = snapshot.projection;
    this.metric(
      document,
      'Projected hours saved',
      String(projection.projectedHoursSaved ?? 0),
    );
    this.metric(
      document,
      'Projected money saved',
      this.money(
        Number(projection.projectedMoneySaved || 0),
        String(projection.currency || 'USD'),
      ),
    );
    document
      .moveDown(0.5)
      .fontSize(9)
      .fillColor('#667085')
      .text(
        'Projection uses the trailing 30-day daily average. Time and monetary savings are estimates based on the configured methodology; CRM revenue is excluded from money saved.',
      );

    this.section(document, 'CRM Revenue / Pipeline');
    const revenue = snapshot.crmRevenue as {
      availability?: unknown;
      currencies?: Array<Record<string, unknown>>;
    };
    if (revenue.availability !== 'AVAILABLE') {
      document.fontSize(10).fillColor('#667085').text('No CRM revenue data.');
    } else {
      for (const currency of revenue.currencies || []) {
        this.metric(
          document,
          `${currency.currency} pipeline`,
          `${this.money(Number(currency.totalAmount || 0), String(currency.currency))} across ${currency.dealCount} deals`,
        );
      }
    }

    this.section(document, 'Methodology');
    const configuration = snapshot.configuration;
    document
      .fontSize(9)
      .fillColor('#475467')
      .text(`Methodology version: ${configuration.methodologyVersion}`)
      .text(`Configuration source: ${configuration.source}`)
      .text(
        `Task creation: ${configuration.taskCreationMinutes} minutes/action`,
      )
      .text(
        `Meeting scheduling: ${configuration.meetingSchedulingMinutes} minutes/action`,
      )
      .text(`CRM update: ${configuration.crmUpdateMinutes} minutes/action`)
      .text(`Email drafting: ${configuration.emailDraftMinutes} minutes/action`)
      .text(
        `Blended labor cost: ${this.money(configuration.hourlyLaborCost, configuration.currency)}/hour`,
      );

    return new Promise((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.end();
    });
  }

  private section(document: PDFKit.PDFDocument, title: string) {
    document
      .moveDown(1.2)
      .fontSize(14)
      .fillColor('#111827')
      .text(title)
      .moveDown(0.4);
  }

  private metric(document: PDFKit.PDFDocument, label: string, value: string) {
    document
      .fontSize(10)
      .fillColor('#667085')
      .text(label, { continued: true })
      .fillColor('#101828')
      .text(`  ${value}`, { align: 'right' });
  }

  private money(value: number, currency: string) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${currency} ${value.toFixed(2)}`;
    }
  }
}
