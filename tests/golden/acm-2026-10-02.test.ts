import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDv360Csv } from '@/engine/csv/dv360';
import { normalizeKey } from '@/engine/grouping/names';
import { convertSerialZone, serialFromDmy, serialFromYmd } from '@/engine/dates/serial';
import { acmModule } from '@/advertisers/acm';
import { campaignHealth } from '@/advertisers/acm/rules';
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

/**
 * Oct 2026 changes:
 * - No IO is stopped any more. Targeted Clicks sit on the main IO only, what is still needed is shown once on the
 *   last IO, and every IO shows the campaign's Health.
 * - What is still needed = Total Clicks (no 10% buffer) − every IO's clicks; Health paces against Total Clicks too.
 * Figures the change does not touch must still match the report exactly. Figures that follow from Required are
 * worked out here from the report's own inputs under the new rule (REQUIRED_FIELDS / HEAD_FIELDS).
 */
const BLANK_ON_EARLIER_IOS = ['requiredClicks', 'impressionsNeeded', 'impressionsTotal'] as const;
const REQUIRED_FIELDS = ['requiredClicks', 'impressionsNeeded', 'impressionsTotal', 'novaFee', 'projectedMediaCost'] as const;
const HEAD_FIELDS = ['netProfit', 'margin', 'projectedNetProfit', 'projectedMargin'] as const;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** The report's inputs, re-run under the new rule. Keyed by row index. */
const derived = (() => {
  const out = new Map<number, Record<string, number | null>>();
  const byGroup = new Map<string, number[]>();
  result.rows.forEach((r, i) => byGroup.set(r.groupKey, [...(byGroup.get(r.groupKey) ?? []), i]));
  for (const idx of byGroup.values()) {
    const e = (i: number) => golden.expected[i] ?? {};
    const head = idx[0] as number;
    const last = idx[idx.length - 1] as number;
    const total = result.rows[head]?.isChild ? null : num(e(head)['totalClicks']);
    const achieved = idx.reduce((s, i) => s + (num(e(i)['achievedClicks']) ?? 0), 0);
    const required = total == null ? null : Math.max(total - achieved, 0);
    const clicks = num(e(last)['achievedClicks']) ?? 0;
    const impressions = num(e(last)['impressions']) ?? 0;
    const media = num(e(last)['mediaCost']) ?? 0;
    const ctr = impressions === 0 ? null : clicks / impressions;
    const needed = required == null || ctr == null || ctr === 0 ? null : Math.round(required / ctr);
    const totalImpr = needed == null ? null : impressions + needed;
    const lastRow = {
      requiredClicks: required,
      impressionsNeeded: needed,
      impressionsTotal: totalImpr,
      novaFee: totalImpr == null ? null : (totalImpr / 1000) * config.novaCpm,
      projectedMediaCost: impressions > 0 && totalImpr != null ? (media / impressions) * totalImpr : media,
    };
    out.set(last, { ...(out.get(last) ?? {}), ...lastRow });
    const nova = (i: number) => (i === last ? lastRow.novaFee : num(e(i)['novaFee'])) ?? 0;
    const proj = (i: number) => (i === last ? lastRow.projectedMediaCost : num(e(i)['projectedMediaCost'])) ?? 0;
    const budget = num(e(head)['budget']);
    const sum = (f: (i: number) => number) => idx.reduce((s, i) => s + f(i), 0);
    const sumMedia = sum((i) => num(e(i)['mediaCost']) ?? 0);
    const sumFs = sum((i) => num(e(i)['fsFee']) ?? 0);
    const has = budget != null && budget !== 0;
    const np = has ? budget - sumMedia - sumFs - sum(nova) : null;
    const pnp = has ? budget - sum(proj) * (1 + config.fsRate) - sum(nova) : null;
    out.set(head, {
      ...(out.get(head) ?? {}),
      netProfit: np,
      margin: np == null || budget == null ? null : np / budget,
      projectedNetProfit: pnp,
      projectedMargin: pnp == null || budget == null ? null : pnp / budget,
      groupTotal: total,
      groupAchieved: achieved,
    });
  }
  return out;
})();

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
      const multi = (result.groups.find((g) => g.key === row?.groupKey)?.rows.length ?? 1) > 1;
      const earlier = row?.isLatest === false;
      const mine = derived.get(i) ?? {};
      for (const key of numeric) {
        if (earlier && (BLANK_ON_EARLIER_IOS as readonly string[]).includes(key)) continue;
        if (row?.isChild && key === 'targetedClicks') continue;
        const actual = row?.[key] as number | null;
        const newRule = (row?.isLatest && (REQUIRED_FIELDS as readonly string[]).includes(key)) || (row?.isHead && (HEAD_FIELDS as readonly string[]).includes(key));
        if (newRule) {
          const expected = mine[key] ?? null;
          expect(expected == null ? actual == null : actual != null && Math.abs(actual - expected) < 1e-6, `${key}: got ${actual}, new rule gives ${expected}`).toBe(true);
          continue;
        }
        const expected = exp[key] as number | null;
        expect(close(actual, expected, key), `${key}: got ${actual}, sheet shows ${expected}`).toBe(true);
      }
      if (earlier) for (const key of BLANK_ON_EARLIER_IOS) expect(row?.[key], key).toBeNull();
      if (row?.isChild) expect(row.targetedClicks).toBeNull();
      const head = derived.get(result.rows.findIndex((r) => r.groupKey === row?.groupKey)) ?? {};
      expect(row?.health).toBe(campaignHealth(row?.start ?? null, row?.end ?? null, head['groupTotal'] ?? null, head['groupAchieved'] ?? 0, result.today, config));
      if (multi) expect(row?.health).not.toContain('Running with');
    });
  });

  it('Campaign 04 example (main + 2nd IO): still needed = 2,000 − (1,147 + 178) = 675, on the 2nd IO', () => {
    const g = result.groups[3];
    expect(g?.rows[0]?.requiredClicks).toBeNull();
    expect(g?.rows[1]?.requiredClicks).toBe(675);
    expect(g?.head.targetedClicks).toBe(2200); // Targeted keeps its 10% buffer on the main IO
  });

  it('Urgent tab as the report did; Margin Issues follow the new margins (23 → 21 campaigns)', () => {
    const count = (gs: typeof result.urgent) => gs.reduce((n, g) => n + g.rows.length, 0);
    expect(result.urgent).toHaveLength(golden.tabs.urgentGroups);
    expect(count(result.urgent)).toBe(golden.tabs.urgentRows);
    // Fewer clicks still needed means fewer impressions to buy, so two campaigns climb back over 75%.
    const flagged = result.groups
      .filter((g) => {
        const m = derived.get(result.rows.findIndex((r) => r.groupKey === g.key))?.['projectedMargin'];
        return m != null && m < config.minMargin && !(g.head.end != null && Math.floor(g.head.end) < result.today);
      })
      .map((g) => g.key);
    expect(result.marginIssues.map((g) => g.key).sort()).toEqual(flagged.sort());
    expect(result.marginIssues).toHaveLength(21);
    expect(count(result.marginIssues)).toBe(30);
    expect(result.marginIssues[0]?.head.projectedMargin?.toFixed(4)).toBe('0.5741');
  });

  it('shows tracker dates as the report does (5 Sep 00:00 Sydney = 4 Sep 20:00 Dhaka)', () => {
    const first = result.rows[0];
    expect(first?.start).toBeCloseTo(serialFromYmd(2026, 9, 4) + 20 / 24, 9);
    expect(first?.end).toBeCloseTo(serialFromYmd(2026, 10, 22) + 19 / 24, 9); // after Sydney's clocks go forward
  });

  it('builds a sheet spec with one formula row per IO and the group key hidden', () => {
    const spec = acmModule.buildSheetSpec(result, config);
    expect(spec.rows).toHaveLength(49);
    expect(spec.hiddenColumns).toEqual([28]);
    expect(spec.rows[3]?.[6]?.value).toBeNull(); // main IO (sheet row 5): Required shown on the last IO only
    expect(spec.rows[4]?.[6]?.value).toBe('=IFERROR(IF($D$5="","",MAX($D$5-SUMIF($AB$2:$AB,$AB6,$F$2:$F),0)),"")'); // Total Clicks − all IOs
    expect(spec.rows[4]?.[4]?.value).toBeNull(); // Targeted on the main IO only
  });
});

describe('ACM golden test · 3 Oct 2026 (TODAY moves on)', () => {
  const r3 = run(golden.recalculated3Oct.today);

  it('Remaining Days as the report showed them; Health paces every IO against Total Clicks', () => {
    expect(r3.rows.map((r) => r.daysLeft)).toEqual(golden.recalculated3Oct.rows.map((r) => r.daysLeft));
    for (const r of r3.rows) {
      const head = derived.get(r3.rows.findIndex((x) => x.groupKey === r.groupKey)) ?? {};
      expect(r.health, r.name).toBe(campaignHealth(r.start, r.end, head['groupTotal'] ?? null, head['groupAchieved'] ?? 0, r3.today, config));
    }
    expect(r3.rows.filter((r) => !r.isLatest)).toHaveLength(11);
    expect(r3.rows.every((r) => !r.health.includes('Running with'))).toBe(true);
  });
});
