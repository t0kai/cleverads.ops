import type { Dv360Row } from '@/engine/csv/dv360';
import { sheetRound, sheetRoundUp, sumBlanks } from '@/engine/math/sheetMath';
import type { UfurnishConfig } from './config';
import { groupUfurnishCampaigns, type BuyingType } from './names';

/** One campaign row of the "Ufurnish" tab in the Campaign Tracker. Dates are Sheets serial numbers. */
export interface UfurnishTarget {
  readonly start: number | null;
  readonly end: number | null;
  /** "Clicks / Views Target". */
  readonly target: number | null;
  /** "Budget (GBP)". */
  readonly budgetGbp: number | null;
  /** "Budget (AUD)": the tracker's own £ → A$ conversion. */
  readonly budgetAud: number | null;
  /** "Buying Type", or null when blank or not recognised. */
  readonly buyingType: BuyingType | null;
}

export interface UfurnishInput {
  readonly rows: readonly Dv360Row[];
  /** Keyed by normalizeKey(campaign name). */
  readonly targets: ReadonlyMap<string, UfurnishTarget>;
  /** TODAY() in the report's time zone, as a whole-day serial. */
  readonly today: number;
}

/**
 * One report row. Every value mirrors the formula the sheet will hold, so the screen and the sheet agree.
 * The sheet's column order lives in sheet.ts (UFURNISH_COLUMNS).
 */
export interface UfurnishRow {
  readonly name: string;
  readonly type: BuyingType;
  readonly groupKey: string;
  readonly isChild: boolean; // not the campaign's first IO
  readonly isHead: boolean; // first row of its campaign (holds target, budget, profit, margin)
  /** Last IO of its campaign: what is still to come is costed once, here. */
  readonly isLatest: boolean;
  readonly start: number | null;
  readonly end: number | null;
  /** First IO = tracker target. A follow-on IO = what is left for it: Total − every earlier IO's clicks (not CPCV). */
  readonly totalTarget: number | null;
  /** Total + buffer, on every IO that has a Total (display only). */
  readonly targeted: number | null;
  /** Clicks for CPC; blank for CPCV (views are not in the DV360 CSV). */
  readonly achieved: number | null;
  /** Total − every IO's Achieved, on the last IO only. */
  readonly required: number | null;
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number | null;
  readonly impressionsNeeded: number | null;
  readonly impressionsTotal: number | null;
  readonly mediaCost: number; // A$
  readonly fsFee: number; // A$
  readonly novaFee: number; // A$
  readonly budgetGbp: number | null;
  readonly budgetAud: number | null;
  readonly netProfit: number | null; // A$
  readonly margin: number | null;
  readonly health: string;
  readonly daysLeft: number | null;
  readonly comment: string;
  readonly projectedMediaCost: number;
  readonly projectedNetProfit: number | null; // A$
  readonly projectedMargin: number | null;
  /** This IO's margin on the clicks it has delivered (revenue = clicks × Budget (AUD) ÷ click target). */
  readonly ioMargin: number | null;
  /** First row: the same for all the campaign's IOs together. */
  readonly overallMargin: number | null;
}

export interface UfurnishGroupResult {
  readonly key: string;
  readonly type: BuyingType;
  readonly rows: readonly UfurnishRow[];
  readonly head: UfurnishRow;
}

export interface UfurnishResult {
  readonly rows: readonly UfurnishRow[];
  readonly groups: readonly UfurnishGroupResult[];
  /** Campaigns ending within urgentDays, soonest first. */
  readonly urgent: readonly UfurnishGroupResult[];
  /** Campaigns whose projected margin is below minMargin and not yet ended, lowest first. */
  readonly marginIssues: readonly UfurnishGroupResult[];
  readonly counts: Readonly<Record<BuyingType, number>>;
  readonly warnings: readonly string[];
  readonly today: number;
}

export const NO_VIEWS_COMMENT = 'CPCV: views are not in the DV360 CSV – pacing not calculated';
export const NO_TRACKER_COMMENT = 'Not in the Ufurnish tab – target not calculated';

/** Campaign Health. */
export function campaignHealth(
  start: number | null,
  end: number | null,
  total: number | null,
  achieved: number,
  today: number,
  config: Pick<UfurnishConfig, 'paceAhead' | 'paceOnTrack' | 'paceBehind'>,
): string {
  if (total == null || start == null || end == null) return '';
  if (achieved >= total) return '🟢 Completed';
  if (today < start) return 'Not Started';
  if (today > end) return 'Ended';
  if (total === 0) return '';
  const delivered = achieved / total;
  const expected = (today - start + 1) / (end - start + 1);
  const perDay = sheetRound((total - achieved) / Math.max(1, end - today), 0);
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

/** (revenue − media − FS fee − Nova fee on impressions spent) ÷ revenue, all A$. Blank without revenue. */
export function deliveredMargin(revenueAud: number | null, mediaCost: number, impressions: number, config: Pick<UfurnishConfig, 'fsRate' | 'novaCpm'>): number | null {
  if (revenueAud == null || revenueAud <= 0) return null;
  return (revenueAud - mediaCost * (1 + config.fsRate) - (impressions / 1000) * config.novaCpm) / revenueAud;
}

type Draft = Omit<UfurnishRow, 'netProfit' | 'margin' | 'projectedNetProfit' | 'projectedMargin' | 'ioMargin' | 'overallMargin'>;

export function calculateUfurnish(input: UfurnishInput, config: UfurnishConfig): UfurnishResult {
  const { today } = input;
  const warnings: string[] = [];
  const out: UfurnishGroupResult[] = [];

  for (const g of groupUfurnishCampaigns(input.rows, [...input.targets.keys()])) {
    const firstName = g.members[0]?.item.name ?? g.key;
    const t = g.matched ? input.targets.get(g.key) : undefined;
    const type: BuyingType = t?.buyingType ?? 'CPC';

    // A$ budget: the tracker's Budget (AUD); only when it is blank, target × the A$ rate from settings.
    let budgetAud = t?.budgetAud ?? null;
    if (!t) warnings.push(`No row in the Ufurnish tab for "${firstName}". Its target and budget are left blank.`);
    else {
      if (t.buyingType == null) warnings.push(`No Buying Type in the tracker for "${firstName}"; treated as CPC.`);
      if (t.target == null) warnings.push(`No Clicks / Views Target in the tracker for "${firstName}".`);
      if (type === 'CPCV') warnings.push(`"${firstName}" is CPCV: views are not in the DV360 CSV, so pacing and IO margins are left blank.`);
      if (budgetAud == null && t.target != null) {
        const rate = type === 'CPC' ? config.fallbackCpcAud : config.fallbackCpcvAud;
        budgetAud = t.target * rate;
        warnings.push(`No Budget (AUD) in the tracker for "${firstName}"; used ${t.target} × A$${rate.toFixed(2)}.`);
      }
    }

    // One target per campaign, on its first IO. Every IO's clicks count towards it; what is still needed
    // (Total, without the buffer, minus every IO's clicks) is shown once, on the last IO.
    const paced = t != null && type === 'CPC';
    const groupTotal = paced ? t.target : null;
    const groupAchieved = paced ? sumBlanks(g.members.map((m) => m.item.clicks)) : 0;
    const groupRequired = groupTotal == null ? null : Math.max(groupTotal - groupAchieved, 0);
    const start = t?.start ?? null;
    const end = t?.end ?? null;

    let earlierClicks = 0;
    const partial: Draft[] = g.members.map((m, i) => {
      const isHead = i === 0;
      const isLatest = i === g.members.length - 1;
      const { clicks, impressions, cost: media } = m.item;
      // A follow-on IO shows what is left for it: Total − every earlier IO's clicks. CPCV has no delivery to count.
      const total = isHead ? (t?.target ?? null) : groupTotal == null ? null : Math.max(groupTotal - earlierClicks, 0);
      earlierClicks += clicks;
      const required = isLatest ? groupRequired : null;
      const ctr = impressions === 0 ? null : clicks / impressions;
      const needed = required == null || ctr == null || ctr === 0 ? null : sheetRound(required / ctr, 0);
      const imprTotal = needed == null ? null : impressions + needed;
      let comment = '';
      if (isHead && !t) comment = NO_TRACKER_COMMENT;
      else if (isHead && type === 'CPCV') comment = NO_VIEWS_COMMENT;
      return {
        name: m.item.name,
        type,
        groupKey: g.key,
        isChild: !isHead,
        isHead,
        isLatest,
        start,
        end,
        totalTarget: total,
        targeted: total == null ? null : sheetRound(total + total * config.targetBuffer, 0),
        achieved: type === 'CPC' ? clicks : null,
        required,
        clicks,
        impressions,
        ctr,
        impressionsNeeded: needed,
        impressionsTotal: imprTotal,
        mediaCost: media,
        fsFee: media * config.fsRate,
        // The latest IO is costed on the impressions it still needs; earlier IOs (and a latest IO with nothing
        // to work out) on what they have spent.
        novaFee: ((isLatest && imprTotal != null ? imprTotal : impressions) / 1000) * config.novaCpm,
        budgetGbp: isHead ? (t?.budgetGbp ?? null) : null,
        budgetAud: isHead ? budgetAud : null,
        health: campaignHealth(start, end, groupTotal, groupAchieved, today, config),
        daysLeft: daysLeft(end, today),
        comment,
        projectedMediaCost: isLatest && impressions > 0 && imprTotal != null ? (media / impressions) * imprTotal : media,
      };
    });

    const head = partial[0];
    if (!head) continue;
    const sumMedia = sumBlanks(partial.map((r) => r.mediaCost));
    const sumFs = sumBlanks(partial.map((r) => r.fsFee));
    const sumNova = sumBlanks(partial.map((r) => r.novaFee));
    const sumProj = sumBlanks(partial.map((r) => r.projectedMediaCost));
    const S = head.budgetAud;
    const hasBudget = S != null && S !== 0;

    // Revenue in A$ per click: Budget (AUD) ÷ click target. CPCV: no views, so no revenue to count.
    const perClick = type === 'CPC' && S != null && head.totalTarget ? S / head.totalTarget : null;
    const revenueOf = (clicks: number) => (perClick == null ? null : clicks * perClick);
    const overall = deliveredMargin(revenueOf(sumBlanks(partial.map((r) => r.clicks))), sumMedia, sumBlanks(partial.map((r) => r.impressions)), config);

    const rows: UfurnishRow[] = partial.map((r) => {
      const net = r.isHead && hasBudget ? S - sumMedia - sumFs - sumNova : null;
      const projNet = r.isHead && hasBudget ? S - sumProj * (1 + config.fsRate) - sumNova : null;
      return {
        ...r,
        netProfit: net,
        margin: net == null || S == null ? null : net / S,
        projectedNetProfit: projNet,
        projectedMargin: projNet == null || S == null ? null : projNet / S,
        ioMargin: deliveredMargin(revenueOf(r.clicks), r.mediaCost, r.impressions, config),
        overallMargin: r.isHead ? overall : null,
      };
    });
    out.push({ key: g.key, type, rows, head: rows[0] as UfurnishRow });
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
    counts: { CPC: out.filter((g) => g.type === 'CPC').length, CPCV: out.filter((g) => g.type === 'CPCV').length },
    warnings,
    today,
  };
}
