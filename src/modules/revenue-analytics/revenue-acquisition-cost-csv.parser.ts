import { BadRequestException } from '@nestjs/common';
import {
  normalizeCsvHeader,
  parseCsvRows,
} from '../../common/helpers/csv-rows.helper';
import { RevenueAcquisitionChannel } from './revenue-analytics.enums';

export const MAX_ACQUISITION_COST_IMPORT_ROWS = 500;

export type RevenueAcquisitionCostImportRow = {
  period: string;
  channel: RevenueAcquisitionChannel;
  salesCostUsd: number;
  marketingCostUsd: number;
  notes?: string;
};

const HEADERS = [
  'period',
  'channel',
  'sales_cost_usd',
  'marketing_cost_usd',
  'notes',
] as const;

export function parseRevenueAcquisitionCostCsv(
  buffer: Buffer,
): RevenueAcquisitionCostImportRow[] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows = parseCsvRows(text).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );
  if (rows.length < 2) {
    throw new BadRequestException(
      'CSV must contain a header and at least one acquisition cost row',
    );
  }
  const headers = rows[0].map(normalizeCsvHeader);
  const unknown = headers.filter(
    (header) => !HEADERS.includes(header as (typeof HEADERS)[number]),
  );
  if (unknown.length) {
    throw new BadRequestException(
      `Unsupported CSV columns: ${[...new Set(unknown)].join(', ')}`,
    );
  }
  for (const required of HEADERS.slice(0, 4)) {
    if (!headers.includes(required)) {
      throw new BadRequestException(`CSV must include ${required}`);
    }
  }
  if (new Set(headers).size !== headers.length) {
    throw new BadRequestException('CSV contains duplicate columns');
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ACQUISITION_COST_IMPORT_ROWS) {
    throw new BadRequestException(
      `An acquisition cost import supports at most ${MAX_ACQUISITION_COST_IMPORT_ROWS} rows`,
    );
  }

  const parsed = dataRows.map((row, index) => {
    if (row.length > headers.length) {
      throw new BadRequestException(
        `CSV row ${index + 2} contains more values than the header`,
      );
    }
    const values = new Map(
      headers.map((header, column) => [header, (row[column] ?? '').trim()]),
    );
    const period = values.get('period') ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException(
        `CSV row ${index + 2} has an invalid period; expected YYYY-MM`,
      );
    }
    const channel = (values.get('channel') ?? '')
      .toUpperCase()
      .replace(/[\s-]+/g, '_') as RevenueAcquisitionChannel;
    if (!Object.values(RevenueAcquisitionChannel).includes(channel)) {
      throw new BadRequestException(
        `CSV row ${index + 2} has an unsupported channel`,
      );
    }
    return {
      period,
      channel,
      salesCostUsd: money(values.get('sales_cost_usd'), index),
      marketingCostUsd: money(values.get('marketing_cost_usd'), index),
      ...(values.get('notes')
        ? { notes: values.get('notes')!.slice(0, 500) }
        : {}),
    };
  });
  const keys = new Set<string>();
  for (const [index, row] of parsed.entries()) {
    const key = `${row.period}:${row.channel}`;
    if (keys.has(key)) {
      throw new BadRequestException(
        `CSV row ${index + 2} duplicates an earlier period and channel`,
      );
    }
    keys.add(key);
  }
  return parsed;
}

function money(value: string | undefined, index: number) {
  if (value === undefined || value === '') {
    throw new BadRequestException(`CSV row ${index + 2} has a missing cost`);
  }
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    !/^\d+(\.\d{1,2})?$/.test(value)
  ) {
    throw new BadRequestException(
      `CSV row ${index + 2} has an invalid USD cost`,
    );
  }
  return parsed;
}
