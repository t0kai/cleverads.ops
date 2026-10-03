import { ValidationError } from '@/shared/errors';
import { parseCsv } from './parseCsv';
import { parseNumber } from './numbers';

export interface Dv360Row {
  /** IO name with the word "IO" removed and spaces tidied. */
  readonly name: string;
  readonly impressions: number;
  readonly clicks: number;
  /** DV360 "Revenue" = media cost in advertiser currency. */
  readonly cost: number;
  readonly objective: string;
  readonly status: string;
}

export interface Dv360ParseResult {
  readonly rows: readonly Dv360Row[];
  readonly columnsFound: readonly string[];
  readonly skippedBlankRows: number;
}

/** Column names are matched by name (any order, any case). Extra spellings go in the lists. */
const COLUMNS = {
  name: ['name', 'insertion order', 'insertion order name', 'io name'],
  impressions: ['impressions', 'impressions (total)'],
  clicks: ['clicks'],
  revenue: ['revenue', 'revenue (adv currency)', 'media cost'],
  objective: ['objective', 'insertion order objective'],
  status: ['status', 'insertion order status'],
} as const;

const REQUIRED = ['name', 'impressions', 'clicks', 'revenue'] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export function cleanIoName(raw: string): string {
  return raw.replace(/\bIO\b/gi, '').replace(/\s+/g, ' ').trim();
}

function findColumn(headers: readonly string[], names: readonly string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const idx = lower.indexOf(n);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Read a DV360 insertion-order CSV. Throws ValidationError with every problem at once. */
export function readDv360Csv(text: string): Dv360ParseResult {
  if (text.length > MAX_BYTES) {
    throw new ValidationError('The file is larger than 10 MB.', ['Export only the insertion orders for this advertiser.']);
  }
  const table = parseCsv(text);
  const headers = table[0];
  if (!headers || table.length < 2) {
    throw new ValidationError('The file is empty.', ['Download the insertion-order list from DV360 again.']);
  }

  const idx = {
    name: findColumn(headers, COLUMNS.name),
    impressions: findColumn(headers, COLUMNS.impressions),
    clicks: findColumn(headers, COLUMNS.clicks),
    revenue: findColumn(headers, COLUMNS.revenue),
    objective: findColumn(headers, COLUMNS.objective),
    status: findColumn(headers, COLUMNS.status),
  };
  const missing = REQUIRED.filter((k) => idx[k] === -1);
  if (missing.length) {
    throw new ValidationError(
      'Some columns are missing from the CSV.',
      missing.map((m) => `Missing column: ${m[0]?.toUpperCase()}${m.slice(1)}`),
      'Download the CSV from DV360 › Insertion orders again, without editing it in Excel.',
    );
  }

  const cell = (r: readonly string[], i: number) => (i === -1 ? '' : (r[i] ?? ''));
  const rows: Dv360Row[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    if (r.every((c) => c.trim() === '')) {
      skipped++;
      continue;
    }
    const name = cleanIoName(cell(r, idx.name));
    if (!name) {
      skipped++;
      continue;
    }
    rows.push({
      name,
      impressions: parseNumber(cell(r, idx.impressions)),
      clicks: parseNumber(cell(r, idx.clicks)),
      cost: parseNumber(cell(r, idx.revenue)),
      objective: cell(r, idx.objective).trim(),
      status: cell(r, idx.status).trim(),
    });
  }
  if (!rows.length) {
    throw new ValidationError('No insertion orders were found in the file.', ['Check that the CSV has rows under the header.']);
  }

  const columnsFound = (Object.keys(idx) as (keyof typeof idx)[]).filter((k) => idx[k] !== -1);
  return { rows, columnsFound, skippedBlankRows: skipped };
}
