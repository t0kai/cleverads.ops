import type { EconomistTarget } from '@/advertisers/economist';
import { parseNumber } from '@/engine/csv/numbers';
import { convertSerialZone, serialFromDmy } from '@/engine/dates/serial';
import { normalizeKey } from '@/engine/grouping/names';
import { ValidationError } from '@/shared/errors';

/**
 * "The Economist" tab of the Campaign Tracker → click targets, £/A$ budgets and the GBP → AUD rate (one row per country). Read only: this file never writes to the tracker.
 * Columns are found by name (trimmed, lowercase) in the header row; the first match wins.
 */
const COLUMNS = {
  name: ['campaign name'],
  target: ['click target', 'clicks target'],
  start: ['start date'],
  end: ['end date'],
  budgetAud: ['budget (aud)'],
  budgetGbp: ['budget - billing currency(gbp)', 'budget - billing currency (gbp)', 'budget/billing currency (gbp)', 'budget (gbp)'],
  fx: ['conversion rate (gbp - aud)', 'conversion rate (gbp-aud)', 'conversion rate'],
} as const;
type ColumnKey = keyof typeof COLUMNS;

export function findEconomistColumns(header: readonly unknown[]): Record<ColumnKey, number> {
  const names = header.map((h) => String(h ?? '').trim().toLowerCase());
  const find = (options: readonly string[]) => {
    for (const o of options) {
      const i = names.indexOf(o);
      if (i >= 0) return i;
    }
    return -1;
  };
  const found = Object.fromEntries((Object.keys(COLUMNS) as ColumnKey[]).map((k) => [k, find(COLUMNS[k])])) as Record<ColumnKey, number>;
  const missing = (Object.keys(COLUMNS) as ColumnKey[]).filter((k) => found[k] < 0).map((k) => `"${COLUMNS[k][0]}"`);
  if (missing.length) {
    throw new ValidationError(
      'The Economist tab of the Campaign Tracker has a different header row.',
      [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} (looked in the header row).`],
      'Put the column names back, or tell the developer the new names.',
    );
  }
  return found;
}

export interface TrackerZones {
  /** Time zone of the tracker spreadsheet (where the dates were typed). */
  readonly trackerTimeZone: string;
  /** Time zone of the report spreadsheet. */
  readonly reportTimeZone: string;
}

function toSerial(value: unknown, zones: TrackerZones): number | null {
  let serial: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) serial = value;
  else if (typeof value === 'string' && value.trim()) serial = serialFromDmy(value.trim());
  return serial == null ? null : convertSerialZone(serial, zones.trackerTimeZone, zones.reportTimeZone);
}

/** Empty, zero or unreadable → null. */
function toAmount(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = typeof value === 'number' ? value : parseNumber(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** values[0] is the header row; the rest are campaigns. A later row with the same name wins. */
export function parseEconomistTargets(values: readonly (readonly unknown[])[], zones: TrackerZones): Map<string, EconomistTarget> {
  const [header, ...rows] = values;
  if (!header) throw new ValidationError('The Economist tab of the Campaign Tracker is empty.', [], 'Check the tracker link and tab name.');
  const col = findEconomistColumns(header);
  const targets = new Map<string, EconomistTarget>();
  for (const row of rows) {
    const name = row[col.name];
    if (name == null || String(name).trim() === '') continue;
    targets.set(normalizeKey(String(name)), {
      start: toSerial(row[col.start], zones),
      end: toSerial(row[col.end], zones),
      target: toAmount(row[col.target]),
      budgetAud: toAmount(row[col.budgetAud]),
      budgetGbp: toAmount(row[col.budgetGbp]),
      fx: toAmount(row[col.fx]),
    });
  }
  return targets;
}
