import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDv360Csv } from '@/engine/csv/dv360';
import { normalizeKey } from '@/engine/grouping/names';
import { convertSerialZone, serialFromDmy, serialFromYmd } from '@/engine/dates/serial';
import { acmModule } from '@/advertisers/acm';
import type { AcmRow } from '@/advertisers/acm';
import type { TargetRow } from '@/advertisers/types';

/**
 * Golden test: the anonymised 2 Oct 2026 ACM export must give exactly what the Apps Script report showed,
 * worked out the same way the app does it: tracker dates (Australia/Sydney) moved into the report's
 * time zone (Asia/Dhaka), TODAY taken in Dhaka.
 */
interface Golden {
  today: string;
  targets: Record<string, { start: string; end: string; clicks: number }>;
  expected: Record<string, number | string | null>[];
  tabs: { urgentGroups: number; urgentRows: number; marginGroups: number; marginRows: number };
  trackerTimeZone: string;
  recalculated3Oct: { sheetTimeZone: string; today: string; rows: { health: string | null; daysLeft: number | null }[] };
}

const dir = new URL('../fixtures/acm-2026-10-02/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('golden.json', dir), 'utf8')) as Golden;
const csv = readFileSync(new URL('dv360.csv', dir), 'utf8');

const REPORT_ZONE = golden.recalculated3Oct.sheetTimeZone; // Asia/Dhaka
const toReport = (dmy: string): number | null => {
  const serial = serialFromDmy(dmy);
  return serial == null ? null : convertSerialZone(serial, golden.trackerTimeZone, REPORT_ZONE);
};
const targets = new Map<string, TargetRow>(
  Object.entries(golden.targets).map(([name, t]) => [
    normalizeKey(name),
    { start: toReport(t.start), end: toReport(t.end), clicks: t.clicks },
  ]),
);
const rows = readDv360Csv(csv).rows;
const config = acmModule.parseConfig({});
const run = (isoDay: string) => {
  const [y, m, d] = isoDay.split('-').map(Number) as [number, number, number];
  return acmModule.calculate({ rows, targets, today: serialFromYmd(y, m, d) }, config);
};
const result = run(golden.today);

// The sheet shows percentages and projected money with 2 decimals; everything else at full precision.

const DISPLAY_2DP = new Set(['ctr', 'margin', 'projectedMargin', 'projectedMediaCost', 'projectedNetProfit']);

function close(actual: number | null, expected: number | null, key: string): boolean {
  if (expected == null) return actual == null;
  if (actual == null) return false;
  if (DISPLAY_2DP.has(key)) {
    const scale = key === 'ctr' || key.endsWith('argin') ? 10_000 : 100;
    return Math.round(actual * scale) === Math.round(expected * scale);
  }
  return Math.abs(actual - expected) < 1e-6;
}

describe('ACM golden test · 2 Oct 2026', () => {
  it('keeps every IO, in the same order', () => {
    expect(result.rows.map((r) => r.name)).toEqual(golden.expected.map((e) => e['name']));
  });

  it('groups 11 campaigns with a 2nd IO', () => {
    expect(result.groups).toHaveLength(38);
    expect(result.groups.filter((g) => g.rows.length > 1)).toHaveLength(11);
  });

  const numeric = Object.keys(golden.expected[0] ?? {}).filter((k) => k !== 'name' && k !== 'health') as (keyof AcmRow)[];
  golden.expected.forEach((exp, i) => {
    it(`row ${i + 2}: ${String(exp['name'])}`, () => {
      const row = result.rows[i];
      expect(row).toBeDefined();
      for (const key of numeric) {
        const actual = row?.[key] as number | null;
        const expected = exp[key] as number | null;
        expect(close(actual, expected, key), `${key}: got ${actual}, sheet shows ${expected}`).toBe(true);
      }
      if (exp['health']) expect(row?.health).toBe(exp['health']);
    });
  });

  it('matches the sheet for the Campaign 04 example (main + 2nd IO) (2nd: 875 required, group profit 837.61)', () => {
    const g = result.groups[3];
    expect(g?.rows[1]?.requiredClicks).toBe(875);
    expect(g?.head.projectedNetProfit?.toFixed(2)).toBe('837.61');
  });

  it('puts the same campaigns in the Urgent and Margin Issue tabs as the report did', () => {
    const count = (gs: typeof result.urgent) => gs.reduce((n, g) => n + g.rows.length, 0);
    expect(result.urgent).toHaveLength(golden.tabs.urgentGroups);
    expect(count(result.urgent)).toBe(golden.tabs.urgentRows);
    expect(result.marginIssues).toHaveLength(golden.tabs.marginGroups);
    expect(count(result.marginIssues)).toBe(golden.tabs.marginRows);
    expect(result.marginIssues[0]?.head.projectedMargin?.toFixed(4)).toBe('0.5208');
  });

  it('shows tracker dates as the report does (5 Sep 00:00 Sydney = 4 Sep 20:00 Dhaka)', () => {
    const first = result.rows[0];
    expect(first?.start).toBeCloseTo(serialFromYmd(2026, 9, 4) + 20 / 24, 9);
    expect(first?.end).toBeCloseTo(serialFromYmd(2026, 10, 22) + 19 / 24, 9); // after Sydney's clocks go forward
  });

  it('builds a sheet spec with one formula row per IO and the group key hidden', () => {
    const spec = acmModule.buildSheetSpec(result, config);
    expect(spec.rows).toHaveLength(49);
    expect(spec.hiddenColumns).toEqual([26]);
    expect(spec.rows[4]?.[4]?.value).toBe('=MAX(E5-F5,0)');
    expect(spec.rows[3]?.[6]?.value).toBe(0);
  });
});

describe('ACM golden test · 3 Oct 2026 (TODAY moves on)', () => {
  const r3 = run(golden.recalculated3Oct.today);

  it('matches all 49 rows of Campaign Health and Remaining Days as the report showed them', () => {
    expect(r3.rows.map((r) => [r.health, r.daysLeft])).toEqual(
      golden.recalculated3Oct.rows.map((r) => [r.health, r.daysLeft]),
    );
  });
});
