import type { Dv360Row } from '@/engine/csv/dv360';
import { groupCampaigns } from '@/engine/grouping/groupCampaigns';
import { normalizeKey } from '@/engine/grouping/names';
import { sheetRound, sheetRoundUp, sumBlanks } from '@/engine/math/sheetMath';
import type { PinstripeConfig } from './config';

/** One campaign row of the Pinstripe tab in the Campaign Tracker. Dates are Sheets serial numbers. */
export interface PinstripeTarget {
  readonly start: number | null;
  readonly end: number | null;
  /** "Click Target" column: clicks, or impressions for an impression campaign. */
  readonly target: number | null;
  /** "Budget (AUD)" column. Used for impression campaigns, where it is typed in by hand. */
  readonly budget: number | null;
}

export interface PinstripeInput {
  readonly rows: readonly Dv360Row[];
  /** Keyed by normalizeKey(campaign name). */
  readonly targets: ReadonlyMap<string, PinstripeTarget>;
  /** TODAY() in the report's time zone, as a whole-day serial. */
  readonly today: number;
}

export type CampaignType = 'Clicks' | 'Impressions';

/**
 * One report row. Letters are the sheet columns; null = blank cell.
 * Every value mirrors the formula the sheet will hold, so the screen and the sheet agree.
 */
export interface PinstripeRow {
  readonly name: string; // A
  readonly type: CampaignType; // B
  readonly groupKey: string; // AB (hidden)
  readonly isChild: boolean; // a 2nd/3rd IO
  readonly isHead: boolean; // first row of its group (holds Budget/Profit/Margin)
  readonly superseded: boolean; // a later IO is running
  readonly nextLabel: string; // "2nd" when a later IO is running
  readonly start: number | null; // C
  readonly end: number | null; // D
  readonly totalTarget: number | null; // E
  readonly targeted: number | null; // F
  readonly achieved: number; // G (clicks or impressions, by type)
  readonly required: number | null; // H
  readonly clicks: number; // I
  readonly impressions: number; // J
  readonly ctr: number | null; // K
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

export interface PinstripeGroupResult {
  readonly key: string;
  readonly type: CampaignType;
  readonly rows: readonly PinstripeRow[];
  readonly head: PinstripeRow;
}

export interface PinstripeResult {
  readonly rows: readonly PinstripeRow[];
  readonly groups: readonly PinstripeGroupResult[];
  /** Groups ending within urgentDays, soonest first. */
  readonly urgent: readonly PinstripeGroupResult[];
  /** Groups whose projected margin is below minMargin and not yet ended, lowest first. */
  readonly marginIssues: readonly PinstripeGroupResult[];
  readonly clickCampaigns: number;
  readonly impressionCampaigns: number;
  readonly warnings: readonly string[];
  readonly today: number;
}

const EMPTY_TARGET: PinstripeTarget = { start: null, end: null, target: null, budget: null };

/** Click Target at or above the threshold → impression campaign. A missing target counts as clicks. */
export function campaignType(target: number | null, config: Pick<PinstripeConfig, 'impressionTargetFrom'>): CampaignType {
  return target != null && target >= config.impressionTargetFrom ? 'Impressions' : 'Clicks';
}

/** Campaign Health (column T). Works the same for clicks and impressions. */
export function campaignHealth(
  start: number | null,
  end: number | null,
  targeted: number | null,
  achieved: number,
  today: number,
  config: Pick<PinstripeConfig, 'paceAhead' | 'paceOnTrack' | 'paceBehind'>,
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

/** Remaining days: MAX(0, ROUNDUP(end − TODAY())). */
export function daysLeft(end: number | null, today: number): number | null {
  if (end == null) return null;
  return Math.max(0, sheetRoundUp(end - today, 0));
}

type Draft = Omit<PinstripeRow, 'netProfit' | 'margin' | 'projectedNetProfit' | 'projectedMargin'>;

export function calculatePinstripe(input: PinstripeInput, config: PinstripeConfig): PinstripeResult {
  const { today } = input;
  const warnings: string[] = [];
  const out: PinstripeGroupResult[] = [];

  for (const g of groupCampaigns(input.rows)) {
    const parent = input.targets.get(g.key) ?? EMPTY_TARGET;
    const type = campaignType(parent.target, config);
    const firstName = g.members[0]?.item.name ?? g.key;
    if (g.hasMain && parent.target == null) {
      warnings.push(`No target in the Campaign Tracker for "${firstName}".`);
    }
    if (g.hasMain && type === 'Impressions' && (parent.budget == null || parent.budget === 0)) {
      warnings.push(`No budget in the Campaign Tracker for impression campaign "${firstName}". Margin is not calculated.`);
    }

    const partial: Draft[] = [];
    g.members.forEach((m, i) => {
      const isChild = m.order > 1;
      const own = input.targets.get(normalizeKey(m.item.name)) ?? EMPTY_TARGET;
      // A 2nd/3rd IO starts on the main campaign's start date and ends with it, unless the tracker has its own end date.
      const start = parent.start;
      const end = isChild ? (own.end ?? parent.end) : parent.end;
      const D = isChild ? null : parent.target;
      const next = g.members[i + 1];
      const superseded = next !== undefined;
      const prev = partial[i - 1];

      const clicks = m.item.clicks;
      const impressions = m.item.impressions;
      const N = m.item.cost;
      const G = type === 'Impressions' ? impressions : clicks;

      let F: number | null;
      if (!isChild) F = D == null ? null : sheetRound(D + D * config.targetBuffer, 0);
      else if (prev) F = prev.targeted == null ? null : Math.max(prev.targeted - prev.achieved, 0);
      else F = null;

      let H: number | null = F == null ? null : Math.max(F - G, 0);
      if (superseded) H = 0;
      const K = impressions === 0 ? null : clicks / impressions;
      let L: number | null;
      if (type === 'Impressions') L = H;
      else L = H == null || K == null || K === 0 ? null : sheetRound(H / K, 0);
      const M = L == null ? null : impressions + L;
      const O = N * config.fsRate;
      const P = M == null ? null : (M / 1000) * config.novaCpm;
      let Q: number | null = null;
      if (!isChild) {
        if (type === 'Clicks') Q = D == null ? null : D * config.clientCpc;
        else Q = parent.budget == null || parent.budget === 0 ? null : parent.budget;
      }
      const W = impressions > 0 && M != null ? (N / impressions) * M : N;

      partial.push({
        name: m.item.name,
        type,
        groupKey: g.key,
        isChild,
        isHead: i === 0,
        superseded,
        nextLabel: next?.label ?? '',
        start,
        end,
        totalTarget: D,
        targeted: F,
        achieved: G,
        required: H,
        clicks,
        impressions,
        ctr: K,
        impressionsNeeded: L,
        impressionsTotal: M,
        mediaCost: N,
        fsFee: O,
        novaFee: P,
        budget: Q,
        health: superseded ? `▶ Running with ${next?.label ?? ''}` : campaignHealth(start, end, F, G, today, config),
        daysLeft: daysLeft(end, today),
        comment: isChild && !g.hasMain && i === 0 ? 'Main campaign not in CSV – target not calculated' : '',
        projectedMediaCost: W,
      });
    });

    // Group totals live on the head row (one budget per main + 2nd/3rd).
    const sumN = sumBlanks(partial.map((r) => r.mediaCost));
    const sumO = sumBlanks(partial.map((r) => r.fsFee));
    const sumP = sumBlanks(partial.map((r) => r.novaFee));
    const sumW = sumBlanks(partial.map((r) => r.projectedMediaCost));

    const rows: PinstripeRow[] = partial.map((r) => {
      const Q = r.budget;
      const hasBudget = r.isHead && Q != null && Q !== 0;
      const R = hasBudget ? Q - sumN - sumO - sumP : null;
      const X = hasBudget ? Q - sumW * (1 + config.fsRate) - sumP : null;
      return {
        ...r,
        netProfit: R,
        margin: R == null || Q == null ? null : R / Q,
        projectedNetProfit: X,
        projectedMargin: X == null || Q == null ? null : X / Q,
      };
    });
    const head = rows[0];
    if (head) out.push({ key: g.key, type, rows, head });
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

  return {
    rows: out.flatMap((g) => g.rows),
    groups: out,
    urgent,
    marginIssues,
    clickCampaigns: out.filter((g) => g.type === 'Clicks').length,
    impressionCampaigns: out.filter((g) => g.type === 'Impressions').length,
    warnings,
    today,
  };
}
