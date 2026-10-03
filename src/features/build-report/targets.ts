import type { TargetRow } from '@/advertisers/types';
import { parseNumber } from '@/engine/csv/numbers';
import { convertSerialZone, serialFromDmy } from '@/engine/dates/serial';
import { normalizeKey } from '@/engine/grouping/names';
import { ValidationError } from '@/shared/errors';

/**
 * Campaign Tracker → targets, the same way the Apps Script's buildAcmMap_() reads it:
 * the header row is matched by exact (trimmed, lowercase) column names, empty names are skipped,
 * a later row with the same name wins, and an empty/zero value counts as blank.
 */
const COLUMNS = { name: 'campaign name', start: 'start date', end: 'end date', clicks: 'clicks target' } as const;
type ColumnKey = keyof typeof COLUMNS;

export function findTargetColumns(header: readonly unknown[]): Record<ColumnKey, number> {
  const names = header.map((h) => String(h ?? '').trim().toLowerCase());
  const found = Object.fromEntries((Object.keys(COLUMNS) as ColumnKey[]).map((k) => [k, names.indexOf(COLUMNS[k])])) as Record<ColumnKey, number>;
  const missing = (Object.keys(COLUMNS) as ColumnKey[]).filter((k) => found[k] < 0).map((k) => `"${COLUMNS[k]}"`);
  if (missing.length) {
    throw new ValidationError(
      'The Campaign Tracker header row has changed.',
      [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} (looked in the header row).`],
      'Put the column names back, or tell the developer the new names.',
    );
  }
  return found;
}

export interface TargetZones {
  /** Time zone of the tracker spreadsheet (where the dates were typed). */
  readonly trackerTimeZone: string;
  /** Time zone of the report spreadsheet. */
  readonly reportTimeZone: string;
}

function toSerial(value: unknown, zones: TargetZones): number | null {
  let serial: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) serial = value;
  else if (typeof value === 'string' && value.trim()) serial = serialFromDmy(value);
  return serial == null ? null : convertSerialZone(serial, zones.trackerTimeZone, zones.reportTimeZone);
}

function toClicks(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseNumber(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export interface ParsedTargets {
  readonly targets: Map<string, TargetRow>;
  readonly campaigns: number;
}

/** values[0] is the header row; the rest are campaigns. */
export function parseTargets(values: readonly (readonly unknown[])[], zones: TargetZones): ParsedTargets {
  const [header, ...rows] = values;
  if (!header) throw new ValidationError('The Campaign Tracker tab is empty.', [], 'Check the tracker link and tab name in the advertiser settings.');
  const col = findTargetColumns(header);
  const targets = new Map<string, TargetRow>();
  for (const row of rows) {
    const name = row[col.name];
    if (name == null || String(name).trim() === '') continue;
    targets.set(normalizeKey(String(name)), {
      start: toSerial(row[col.start], zones),
      end: toSerial(row[col.end], zones),
      clicks: toClicks(row[col.clicks]),
    });
  }
  return { targets, campaigns: targets.size };
}
