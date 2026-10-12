import type { Dv360Row } from '@/engine/csv/dv360';
import { normalizeKey } from '@/engine/grouping/names';
import { sheetRound, sheetRoundUp, sumBlanks } from '@/engine/math/sheetMath';
import { TIMEOUT_CAMPAIGN_TYPE, type TimeOutConfig } from './config';
import { groupTimeOutCampaigns } from './names';

/** One campaign row of the TimeOut tab in the Campaign Tracker. Dates are Sheets serial numbers. */
export interface TimeOutTarget {
  readonly start: number | null;
  readonly end: number | null;
  /** "Clicks/View Target" column. */
  readonly clicks: number | null;
}

export interface TimeOutInput {
  readonly rows: readonly Dv360Row[];
  /** Keyed by normalizeKey(campaign name). */
  readonly targets: ReadonlyMap<string, TimeOutTarget>;
  /** TODAY() in the report's time zone, as a whole-day serial. */
  readonly today: number;
}

/**
 * One report row. Letters are the sheet columns; null = blank cell.
 * Every value mirrors the formula the sheet will hold, so the screen and the sheet agree.
 */
export interface TimeOutRow {
  readonly name: string; // A
  readonly campaignType: string; // B ("CPC" for now)
  readonly groupKey: string; // AB (hidden)
  readonly isChild: boolean; // a 2nd/3rd IO
  readonly isHead: boolean; // first row of its group (holds Budget/Profit/Margin)
  readonly superseded: boolean; // a later IO is running
  readonly nextLabel: string; // "2nd" / "3rd" when a later IO is running
  readonly start: number | null; // C
  readonly end: number | null; // D
  readonly totalClicks: number | null; // E
  readonly targetedClicks: number | null; // F
  readonly achievedClicks: number; // G
  readonly requiredClicks: number | null; // H
  readonly requiredPerDay: number | null; // I
  readonly ctr: number | null; // J
  readonly impressions: number; // K
  readonly impressionsNeeded: number | null; // L
  readonly impressionsTotal: number | null; // M
  readonly mediaCost: number; // N
  readonly fsFee: number | null; // O
  readonly novaFee: number | null; // P
  readonly budget: number | null; // Q
  readonly netProfit: number | null; // R
  readonly margin: number | null; // S
  readonly health: string; // T
  readonly daysLeft: number | null; // U
  readonly comment: string; // V
  readonly projectedMediaCost: number | null; // W
  readonly projectedNetProfit: number | null; // X
  readonly projectedMargin: number | null; // Y
}

export interface TimeOutGroupResult {
  readonly key: string;
  readonly rows: readonly TimeOutRow[];
  readonly head: TimeOutRow;
}

export interface TimeOutResult {
  readonly rows: readonly TimeOutRow[];
  readonly groups: readonly TimeOutGroupResult[];
  /** Groups ending within urgentDays, soonest first. */
  readonly urgent: readonly TimeOutGroupResult[];
  /** Groups whose projected margin is below minMargin and not yet ended, lowest first. */
  readonly marginIssues: readonly TimeOutGroupResult[];
  readonly warnings: readonly string[];
  readonly today: number;
}

const EMPTY_TARGET: TimeOutTarget = { start: null, end: null, clicks: null };

/** Campaign Health (column T). */
export function campaignHealth(
  start: number | null,
  end: number | null,
  targeted: number | null,
  achieved: number,
  today: number,
  config: Pick<TimeOutConfig, 'paceAhead' | 'paceOnTrack' | 'paceBehind'>,
): string {
  if (targeted == null || start == null || end == null) return '';
  if (achieved >= targeted) return '🟢 Completed';
  if (today < start) return 'Not Started';
  if (today > end) return 'Ended';
  if (targeted === 0) return '';
  const delivered = achieved / targeted;
  const expected = (today - start + 1) / (end - start + 1);
  const perDay = sheetRound((targeted - achieved) / Math.max(1, end - today), 0);
  if (delivered >= expected + config.paceAhead) return `🟢 Ahead | ${perDay}/day`;
  if (delivered >= expected - config.paceOnTrack) return `🟢 On Pace | ${perDay}/day`;
  if (delivered >= expected - config.paceBehind) return `🟡 Behind | ${perDay}/day`;
  return `🔴 Critical | ${perDay}/day`;
}

/** Remaining days (column U): MAX(0, ROUNDUP(end − TODAY())). */
export function daysLeft(end: number | null, today: number): number | null {
  if (end == null) return null;
  return Math.max(0, sheetRoundUp(end - today, 0));
}

/**
 * Required Clicks / Day (column I): clicks still needed ÷ days left, rounded up.
 * Counts from the start date when the campaign has not started; blank when nothing is needed or it has ended.
 */
export function requiredPerDay(required: number | null, start: number | null, end: number | null, today: number): number | null {
  if (required == null || required === 0 || end == null || today > end) return null;
  return sheetRoundUp(required / Math.max(1, end - Math.max(today, start ?? today)), 0);
}

type Draft = Omit<TimeOutRow, 'netProfit' | 'margin' | 'projectedNetProfit' | 'projectedMargin'>;

export function calculateTimeOut(input: TimeOutInput, config: TimeOutConfig): TimeOutResult {
  const { today } = input;
  const warnings: string[] = [];
  const out: TimeOutGroupResult[] = [];

  for (const g of groupTimeOutCampaigns(input.rows)) {
    const parent = input.targets.get(g.key) ?? EMPTY_TARGET;
    if (g.hasMain && parent.clicks == null) {
      warnings.push(`No Clicks/View Target in the Campaign Tracker for "${g.members[0]?.item.name ?? g.key}".`);
    }

    const drafts: Draft[] = [];
    g.members.forEach((m, i) => {
      const isChild = m.order > 1;
      const own = input.targets.get(normalizeKey(m.item.name)) ?? EMPTY_TARGET;
      // A 2nd/3rd IO starts on the main campaign's start date and ends with it, unless the tracker has its own end date.
      const start = parent.start;
      const end = isChild ? (own.end ?? parent.end) : parent.end;
      const D = isChild ? null : parent.clicks;
      const next = g.members[i + 1];
      const superseded = next !== undefined;
      const prev = drafts[i - 1];

      const F = m.item.clicks;
      const I = m.item.impressions;
      const L = m.item.cost;

      let E: number | null;
      if (!isChild) E = D == null ? null : sheetRound(D + D * config.clickBuffer, 0);
      else if (prev) E = prev.targetedClicks == null ? null : Math.max(prev.targetedClicks - prev.achievedClicks, 0);
      else E = null;

      let G: number | null = E == null ? null : Math.max(E - F, 0);
      if (superseded) G = 0;
      const H = I === 0 ? null : F / I;
      const J = G == null || H == null || H === 0 ? null : sheetRound(G / H, 0);
      const K = J == null ? null : I + J;
      const N = K == null ? null : (K / 1000) * config.novaCpm;

      drafts.push({
        name: m.item.name,
        campaignType: TIMEOUT_CAMPAIGN_TYPE,
        groupKey: g.key,
        isChild,
        isHead: i === 0,
        superseded,
        nextLabel: next?.label ?? '',
        start,
        end,
        totalClicks: D,
        targetedClicks: E,
        achievedClicks: F,
        requiredClicks: G,
        requiredPerDay: requiredPerDay(G, start, end, today),
        ctr: H,
        impressions: I,
        impressionsNeeded: J,
        impressionsTotal: K,
        mediaCost: L,
        fsFee: L * config.fsRate,
        novaFee: N,
        budget: isChild || D == null ? null : D * config.clientCpc,
        health: superseded ? `▶ Running with ${next?.label ?? ''}` : campaignHealth(start, end, E, F, today, config),
        daysLeft: daysLeft(end, today),
        comment: isChild && !g.hasMain && i === 0 ? 'Main campaign not in CSV – target not calculated' : '',
        projectedMediaCost: I > 0 && K != null ? (L / I) * K : L,
      });
    });

    // Group totals live on the head row (one budget per main + 2nd/3rd).
    const sumL = sumBlanks(drafts.map((r) => r.mediaCost));
    const sumM = sumBlanks(drafts.map((r) => r.fsFee));
    const sumN = sumBlanks(drafts.map((r) => r.novaFee));
    const sumU = sumBlanks(drafts.map((r) => r.projectedMediaCost));

    const rows: TimeOutRow[] = drafts.map((r) => {
      const O = r.budget;
      const hasBudget = r.isHead && O != null && O !== 0;
      const P = hasBudget ? O - sumL - sumM - sumN : null;
      const V = hasBudget ? O - sumU * (1 + config.fsRate) - sumN : null;
      return {
        ...r,
        netProfit: P,
        margin: P == null || O == null ? null : P / O,
        projectedNetProfit: V,
        projectedMargin: V == null || O == null ? null : V / O,
      };
    });
    const head = rows[0];
    if (head) out.push({ key: g.key, rows, head });
  }

  const urgent = out
    .filter((g) => {
      if (g.head.end == null) return false;
      const days = Math.floor(g.head.end) - today;
      return days >= 0 && days <= config.urgentDays;
    })
    .sort((a, b) => (a.head.end ?? 0) - (b.head.end ?? 0));

  const marginIssues = out
    .filter((g) => {
      const m = g.head.projectedMargin;
      if (m == null || m >= config.minMargin) return false;
      return !(g.head.end != null && Math.floor(g.head.end) < today);
    })
    .sort((a, b) => (a.head.projectedMargin ?? 0) - (b.head.projectedMargin ?? 0));

  return { rows: out.flatMap((g) => g.rows), groups: out, urgent, marginIssues, warnings, today };
}
