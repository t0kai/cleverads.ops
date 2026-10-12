import type { TimeOutTarget } from '@/advertisers/timeout';
import { parseNumber } from '@/engine/csv/numbers';
import { convertSerialZone, serialFromDmy } from '@/engine/dates/serial';
import { normalizeKey } from '@/engine/grouping/names';
import { ValidationError } from '@/shared/errors';

/**
 * TimeOut tab of the Campaign Tracker → dates and click targets. Read only: this file never writes to the tracker.
 * Columns are found by name (trimmed, lowercase) in the header row; the first match wins.
 */
const COLUMNS = {
  name: ['campaign name'],
  start: ['start date'],
  end: ['end date'],
  clicks: ['clicks/view target', 'clicks target', 'click target'],
} as const;
type ColumnKey = keyof typeof COLUMNS;

export function findTimeOutColumns(header: readonly unknown[]): Record<ColumnKey, number> {
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
      'The TimeOut tab of the Campaign Tracker has a different header row.',
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
function toClicks(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = typeof value === 'number' ? value : parseNumber(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * `values` is the whole tab from A1 (so the read never asks for cells outside the tab).
 * `headerRow` is 1-based. A later row with the same campaign name wins.
 */
export function parseTimeOutTargets(values: readonly (readonly unknown[])[], headerRow: number, zones: TrackerZones): Map<string, TimeOutTarget> {
  const header = values[headerRow - 1];
  if (!header || header.length === 0) {
    throw new ValidationError(`Row ${headerRow} of the TimeOut tab is empty.`, [], 'The header row (Campaign name, Start date, End date, Clicks/View Target) should be there.');
  }
  const col = findTimeOutColumns(header);
  const targets = new Map<string, TimeOutTarget>();
  for (const row of values.slice(headerRow)) {
    const name = row[col.name];
    if (name == null || String(name).trim() === '') continue;
    targets.set(normalizeKey(String(name)), {
      start: toSerial(row[col.start], zones),
      end: toSerial(row[col.end], zones),
      clicks: toClicks(row[col.clicks]),
    });
  }
  return targets;
}
