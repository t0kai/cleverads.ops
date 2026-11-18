import type { Dv360Row } from '@/engine/csv/dv360';
import { sheetRound, sheetRoundUp, sumBlanks } from '@/engine/math/sheetMath';
import type { BusinessInsiderConfig } from './config';
import { groupBusinessInsiderCampaigns } from './names';

/** One campaign row of the "Business Insider" tab in the Campaign Tracker. Dates are Sheets serial numbers. */
export interface BusinessInsiderTarget {
  readonly start: number | null;
  readonly end: number | null;
  /** "Click Target". */
  readonly target: number | null;
  /** "Budget (AUD)". */
  readonly budgetAud: number | null;
  /** "Budget - Billing currency(USD)". */
  readonly budgetUsd: number | null;
  /** "Conversion Rate (USD - AUD)": A$ per US$1. */
  readonly fx: number | null;
}

export interface BusinessInsiderInput {
  readonly rows: readonly Dv360Row[];
  /** Keyed by normalizeKey(campaign name). */
  readonly targets: ReadonlyMap<string, BusinessInsiderTarget>;
  /** TODAY() in the report's time zone, as a whole-day serial. */
  readonly today: number;
}

/**
 * One report row. Every value mirrors the formula the sheet will hold, so the screen and the sheet agree.
 * The sheet's column order lives in sheet.ts (BI_COLUMNS).
 */
export interface BusinessInsiderRow {
  readonly name: string;
  readonly groupKey: string;
  readonly isChild: boolean; // not the campaign's first IO
  readonly isHead: boolean; // first row of its campaign (holds target, budget, Nova %, profit, margin)
  /** Last IO of its campaign: what is still to come is costed once, here. */
  readonly isLatest: boolean;
  readonly start: number | null;
  readonly end: number | null;
  /** First IO = tracker target. A follow-on IO = what is left for it: Total − every earlier IO's clicks. */
  readonly totalClicks: number | null;
  /** Total + buffer, on every IO that has a Total (display only). */
  readonly targetedClicks: number | null;
  readonly achievedClicks: number;
  /** Total − every IO's clicks, on the last IO only. */
  readonly requiredClicks: number | null;
  readonly ctr: number | null;
  /** All impressions the IO has spent. */
  readonly impressions: number;
  /** The Nova share of them (impressions × Nova %): the only ones that carry the Nova fee. */
  readonly novaImpressions: number;
  readonly nonNovaImpressions: number;
  /** First row: the campaign's Nova % (editable in the sheet). */
  readonly novaShare: number | null;
  readonly impressionsNeeded: number | null;
  readonly impressionsTotal: number | null;
  readonly mediaCost: number; // A$
  readonly fsFee: number; // A$
  readonly novaFee: number; // A$
  readonly budgetUsd: number | null;
  readonly fx: number | null;
  readonly budgetAud: number | null;
  readonly netProfitAud: number | null;
  readonly netProfitUsd: number | null;
  readonly margin: number | null;
  readonly health: string;
  readonly daysLeft: number | null;
  readonly comment: string;
  readonly projectedMediaCost: number;
  readonly projectedNetProfit: number | null; // A$
  readonly projectedMargin: number | null;
  /** This IO's margin on the clicks it has delivered (revenue = clicks × Budget (AUD) ÷ Click Target). */
  readonly ioMargin: number | null;
  /** First row: the same for all the campaign's IOs together. */
  readonly overallMargin: number | null;
}

export interface BusinessInsiderGroupResult {
  readonly key: string;
  readonly rows: readonly BusinessInsiderRow[];
  readonly head: BusinessInsiderRow;
}

export interface BusinessInsiderResult {
  readonly rows: readonly BusinessInsiderRow[];
  readonly groups: readonly BusinessInsiderGroupResult[];
  /** Campaigns ending within urgentDays, soonest first. */
  readonly urgent: readonly BusinessInsiderGroupResult[];
  /** Campaigns whose projected margin is below minMargin and not yet ended, lowest first. */
  readonly marginIssues: readonly BusinessInsiderGroupResult[];
  readonly warnings: readonly string[];
  readonly today: number;
}

export const NO_TRACKER_COMMENT = 'Not in the Business Insider tab – target not calculated';

/** Campaign Health. */
export function campaignHealth(
  start: number | null,
  end: number | null,
  total: number | null,
  achieved: number,
  today: number,
  config: Pick<BusinessInsiderConfig, 'paceAhead' | 'paceOnTrack' | 'paceBehind'>,
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

/** (revenue − media − platform fee − Nova fee on Nova impressions spent) ÷ revenue, all A$. Blank without revenue. */
export function deliveredMargin(revenueAud: number | null, mediaCost: number, novaImpressions: number, config: Pick<BusinessInsiderConfig, 'fsRate' | 'novaCpm'>): number | null {
  if (revenueAud == null || revenueAud <= 0) return null;
  return (revenueAud - mediaCost * (1 + config.fsRate) - (novaImpressions / 1000) * config.novaCpm) / revenueAud;
}

type Draft = Omit<BusinessInsiderRow, 'netProfitAud' | 'netProfitUsd' | 'margin' | 'projectedNetProfit' | 'projectedMargin' | 'ioMargin' | 'overallMargin'>;

export function calculateBusinessInsider(input: BusinessInsiderInput, config: BusinessInsiderConfig): BusinessInsiderResult {
  const { today } = input;
  const warnings: string[] = [];
  const out: BusinessInsiderGroupResult[] = [];
  const share = config.novaShare;

  for (const g of groupBusinessInsiderCampaigns(input.rows, [...input.targets.keys()])) {
    const firstName = g.members[0]?.item.name ?? g.key;
    const t = g.matched ? input.targets.get(g.key) : undefined;

    // Budgets: the tracker's Budget (AUD) and US$ budget; when one is missing it is worked out from the other.
    const budgetUsd = t?.budgetUsd ?? (t?.target != null ? t.target * config.clientCpcUsd : null);
    const budgetAud = t?.budgetAud ?? (budgetUsd != null && t?.fx != null ? budgetUsd * t.fx : null);
    if (!t) warnings.push(`No row in the Business Insider tab for "${firstName}". Its target and budget are left blank.`);
    else {
      if (t.target == null) warnings.push(`No Click Target in the tracker for "${firstName}".`);
      if (t.budgetAud == null && budgetAud != null) warnings.push(`No Budget (AUD) in the tracker for "${firstName}"; used US$ budget × rate.`);
      if (budgetAud == null) warnings.push(`No Budget (AUD) or USD → AUD rate in the tracker for "${firstName}". Margin is not calculated.`);
    }
    const fx = t?.fx ?? (budgetAud != null && budgetUsd ? budgetAud / budgetUsd : null);

    // One target per campaign, on its first IO. Every IO's clicks count towards it; what is still needed
    // (Total, without the buffer, minus every IO's clicks) is shown once, on the last IO.
    const groupTotal = t?.target ?? null;
    const groupAchieved = sumBlanks(g.members.map((m) => m.item.clicks));
    const groupRequired = groupTotal == null ? null : Math.max(groupTotal - groupAchieved, 0);
    const start = t?.start ?? null;
    const end = t?.end ?? null;

    let earlierClicks = 0;
    const partial: Draft[] = g.members.map((m, i) => {
      const isHead = i === 0;
      const isLatest = i === g.members.length - 1;
      const { clicks, impressions, cost: media } = m.item;
      // A follow-on IO shows what is left for it: Total − every earlier IO's clicks.
      const total = isHead ? groupTotal : groupTotal == null ? null : Math.max(groupTotal - earlierClicks, 0);
      earlierClicks += clicks;
      const required = isLatest ? groupRequired : null;
      const ctr = impressions === 0 ? null : clicks / impressions;
      const needed = required == null || ctr == null || ctr === 0 ? null : sheetRound(required / ctr, 0);
      const imprTotal = needed == null ? null : impressions + needed;
      const nova = impressions * share;
      return {
        name: m.item.name,
        groupKey: g.key,
        isChild: !isHead,
        isHead,
        isLatest,
        start,
        end,
        totalClicks: total,
        targetedClicks: total == null ? null : sheetRound(total + total * config.targetBuffer, 0),
        achievedClicks: clicks,
        requiredClicks: required,
        ctr,
        impressions,
        novaImpressions: nova,
        nonNovaImpressions: impressions - nova,
        novaShare: isHead ? share : null,
        impressionsNeeded: needed,
        impressionsTotal: imprTotal,
        mediaCost: media,
        fsFee: media * config.fsRate,
        // Nova only on the Nova share. The latest IO is costed on the impressions it still needs; earlier IOs
        // (and a latest IO with nothing to work out) on what they have spent.
        novaFee: (((isLatest && imprTotal != null ? imprTotal : impressions) * share) / 1000) * config.novaCpm,
        budgetUsd: isHead ? budgetUsd : null,
        fx: isHead ? fx : null,
        budgetAud: isHead ? budgetAud : null,
        health: campaignHealth(start, end, groupTotal, groupAchieved, today, config),
        daysLeft: daysLeft(end, today),
        comment: isHead && !t ? NO_TRACKER_COMMENT : '',
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

    // Revenue in A$ per click: Budget (AUD) ÷ Click Target.
    const perClick = S != null && head.totalClicks ? S / head.totalClicks : null;
    const revenueOf = (clicks: number) => (perClick == null ? null : clicks * perClick);
    const overall = deliveredMargin(
      revenueOf(sumBlanks(partial.map((r) => r.achievedClicks))),
      sumMedia,
      sumBlanks(partial.map((r) => r.novaImpressions)),
      config,
    );

    const rows: BusinessInsiderRow[] = partial.map((r) => {
      const net = r.isHead && hasBudget ? S - sumMedia - sumFs - sumNova : null;
      const projNet = r.isHead && hasBudget ? S - sumProj * (1 + config.fsRate) - sumNova : null;
      return {
        ...r,
        netProfitAud: net,
        netProfitUsd: net == null || !r.fx ? null : net / r.fx,
        margin: net == null || S == null ? null : net / S,
        projectedNetProfit: projNet,
        projectedMargin: projNet == null || S == null ? null : projNet / S,
        ioMargin: deliveredMargin(revenueOf(r.achievedClicks), r.mediaCost, r.novaImpressions, config),
        overallMargin: r.isHead ? overall : null,
      };
    });
    out.push({ key: g.key, rows, head: rows[0] as BusinessInsiderRow });
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
