import { isMonthKey, monthKey } from './periods';
import type { MonthRow, RowWarning } from './types';

/**
 * Turns the Data tab (as the Sheets API returns it with UNFORMATTED_VALUE + SERIAL_NUMBER)
 * into clean rows. Columns are found by their heading, so moving a column does not break anything.
 * A bad row is skipped with a warning; it never stops the rest from loading.
 */

const COLUMNS = {
  month: ['month'],
  advertiser: ['advertiser'],
  impressions: ['impressions'],
  clicks: ['clicks'],
  media: ['media cost', 'media cost (aud)', 'media cost (partner currency)'],
  dvPct: ['dv fee %'],
  fsPct: ['fs fee %'],
  dv: ['dv fee', 'dv fee (aud)', 'dv cost'],
  fs: ['fs fee', 'fs fee (aud)', 'fs cost'],
} as const;
type Field = keyof typeof COLUMNS;
const REQUIRED: readonly Field[] = ['month', 'advertiser', 'impressions', 'clicks', 'media'];

export const MAX_ROWS = 20_000;

export class SheetFormatError extends Error {}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function findColumns(header: readonly unknown[]): Record<Field, number> {
  const names = header.map(norm);
  const found = {} as Record<Field, number>;
  for (const field of Object.keys(COLUMNS) as Field[]) {
    found[field] = names.findIndex((n) => (COLUMNS[field] as readonly string[]).includes(n));
  }
  const missing = REQUIRED.filter((f) => found[f] < 0);
  if (missing.length) {
    throw new SheetFormatError(`The Data tab is missing these headings: ${missing.map((f) => COLUMNS[f][0]).join(', ')}.`);
  }
  if (found.dv < 0 && found.dvPct < 0) throw new SheetFormatError('The Data tab needs a "DV fee" or "DV fee %" column.');
  if (found.fs < 0 && found.fsPct < 0) throw new SheetFormatError('The Data tab needs an "FS fee" or "FS fee %" column.');
  return found;
}

/** A number, or null when the cell is blank. Throws on text that is not a number. */
export function readNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('is not a number');
    return value;
  }
  const text = String(value).trim().replace(/^A\$|\$|,|\s|AUD$/gi, '');
  if (text === '') return null;
  const pct = text.endsWith('%');
  const n = Number(pct ? text.slice(0, -1) : text);
  if (!Number.isFinite(n)) throw new Error(`"${String(value)}" is not a number`);
  return pct ? n / 100 : n;
}

const EPOCH = Date.UTC(1899, 11, 30);

/** Month from a date serial, "2026-09", "2026/09", "2026-09-01" or "1/9/2026" (day/month/year). */
export function readMonth(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 20_000 && value < 80_000) {
    const d = new Date(EPOCH + Math.floor(value) * 86_400_000);
    return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  const text = String(value).trim();
  let m = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/.exec(text);
  if (m) {
    const key = monthKey(Number(m[1]), Number(m[2]));
    return isMonthKey(key) ? key : null;
  }
  m = /^\d{1,2}\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) {
    const key = monthKey(Number(m[2]), Number(m[1]));
    return isMonthKey(key) ? key : null;
  }
  return null;
}

export interface ParseResult {
  readonly rows: MonthRow[];
  readonly warnings: RowWarning[];
}

export function parseDataTab(values: readonly (readonly unknown[])[]): ParseResult {
  if (values.length === 0) throw new SheetFormatError('The Data tab is empty.');
  if (values.length - 1 > MAX_ROWS) throw new SheetFormatError(`The Data tab has more than ${MAX_ROWS.toLocaleString('en-AU')} rows.`);
  const col = findColumns(values[0] ?? []);
  const rows: MonthRow[] = [];
  const warnings: RowWarning[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    const sheetRow = i + 1;
    const at = (f: Field) => (col[f] >= 0 ? cells[col[f]] : undefined);
    const advertiser = String(at('advertiser') ?? '').trim().replace(/\s+/g, ' ');
    const rawMonth = at('month');
    // Fully blank rows (or rows with only formulas showing blank) are ignored without a warning.
    if (advertiser === '' && (rawMonth == null || rawMonth === '')) continue;

    try {
      if (advertiser === '') throw new Error('has no advertiser');
      if (advertiser.length > 120) throw new Error('has an advertiser name longer than 120 characters');
      const month = readMonth(rawMonth);
      if (!month) throw new Error('has no valid month (use the 1st of the month, e.g. 1/9/2026)');

      const optional = (f: Field, label: string): number | null => {
        let n: number | null;
        try {
          n = readNumber(at(f));
        } catch (e) {
          throw new Error(`has text in ${label} where a number should be`, { cause: e });
        }
        if (n != null && n < 0) throw new Error(`has a negative ${label}`);
        return n;
      };
      const required = (f: Field, label: string): number => {
        const n = optional(f, label);
        if (n == null) throw new Error(`has no ${label}`);
        return n;
      };
      const impressions = required('impressions', 'Impressions');
      const clicks = required('clicks', 'Clicks');
      const media = required('media', 'Media cost');
      const fee = (amount: Field, pct: Field, label: string) => {
        const direct = col[amount] >= 0 ? optional(amount, label) : null;
        if (direct != null) return direct;
        const rate = col[pct] >= 0 ? optional(pct, `${label} %`) : null;
        if (rate == null) throw new Error(`has no ${label} or ${label} %`);
        if (rate > 1) throw new Error(`has a ${label} % above 100%`);
        return media * rate;
      };
      const dv = fee('dv', 'dvPct', 'DV fee');
      const fs = fee('fs', 'fsPct', 'FS fee');

      const key = `${month}|${advertiser.toLowerCase()}`;
      const first = seen.get(key);
      if (first !== undefined) {
        warnings.push({ row: sheetRow, message: `Row ${sheetRow}: ${advertiser} already has a row for this month (row ${first}). This row was left out.` });
        continue;
      }
      seen.set(key, sheetRow);
      rows.push({ advertiser, month, impressions, clicks, media, dv, fs, total: media + dv + fs });
    } catch (e) {
      warnings.push({ row: sheetRow, message: `Row ${sheetRow} ${(e as Error).message}. It was left out.` });
    }
  }
  rows.sort((a, b) => (a.month === b.month ? a.advertiser.localeCompare(b.advertiser) : a.month < b.month ? -1 : 1));
  return { rows, warnings };
}
