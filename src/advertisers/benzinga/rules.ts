import type { Dv360Row } from '@/engine/csv/dv360';
import { sheetRound, sheetRoundUp, sumBlanks } from '@/engine/math/sheetMath';
import type { BenzingaConfig } from './config';
import { groupBenzingaCampaigns, monthlyBase, type BuyingType } from './names';

/** One campaign row of the "Benzinga (US)" tab in the Campaign Tracker. Dates are Sheets serial numbers. */
export interface BenzingaTarget {
  readonly start: number | null;
  readonly end: number | null;
  /** "View/Click Target": clicks (CPC), impressions (CPM) or views (CPCV). */
  readonly target: number | null;
  /** "Budget/Billing currency (USD)". */
  readonly budgetUsd: number | null;
  /** "Conversion Rate (USD - AUD)": A$ per US$1. */
  readonly fx: number | null;
  /** "Buying Type", or null when blank or not recognised. */
  readonly buyingType: BuyingType | null;
}

export interface BenzingaInput {
  readonly rows: readonly Dv360Row[];
  /** Keyed by normalizeKey(campaign name), one entry per tracker row. */
  readonly targets: ReadonlyMap<string, BenzingaTarget>;
  /** TODAY() in the report's time zone, as a whole-day serial. */
  readonly today: number;
}

/** A campaign as the report sees it: tracker rows split by month are added together. */
export interface CampaignTarget {
  readonly start: number | null;
  readonly end: number | null;
  readonly target: number | null;
  readonly type: BuyingType;
  /** False when the tracker had no recognisable Buying Type (the campaign is then treated as CPC). */
  readonly typeKnown: boolean;
  readonly budgetUsd: number | null;
  readonly budgetAud: number | null;
  /** Budget (AUD) ÷ Budget (USD). With one tracker row this is simply that row's rate. */
  readonly fx: number | null;
  /** How many tracker rows made this campaign (2+ when it was split by month). */
  readonly parts: number;
}

/**
 * One report row. Letters are the sheet columns; null = blank cell.
 * Every value mirrors the formula the sheet will hold, so the screen and the sheet agree.
 */
export interface BenzingaRow {
  readonly name: string; // A
  readonly type: BuyingType; // B
  readonly groupKey: string; // AG (hidden)
  readonly isChild: boolean; // not the campaign's first IO
  readonly isHead: boolean; // first row of its campaign (holds target, budget, profit, margin)
  /** Last IO of its campaign: what is still to come is costed once, here. */
  readonly isLatest: boolean;
  readonly start: number | null; // C
  readonly end: number | null; // D
  readonly totalTarget: number | null; // E
  readonly targeted: number | null; // F (display only: Total + buffer)
  readonly achieved: number | null; // G (clicks for CPC, impressions for CPM, blank for CPCV)
  readonly required: number | null; // H (Total − every IO's Achieved, last IO only)
  readonly clicks: number; // I
  readonly impressions: number; // J
  readonly ctr: number | null; // K
  readonly impressionsNeeded: number | null; // L
  readonly impressionsTotal: number | null; // M
  readonly mediaCost: number; // N (A$)
  readonly fsFee: number; // O (A$)
  readonly novaFee: number; // P (A$)
  readonly budgetUsd: number | null; // Q
  readonly fx: number | null; // R
  readonly budgetAud: number | null; // S
  readonly netProfitAud: number | null; // T
  readonly netProfitUsd: number | null; // U
  readonly margin: number | null; // V
  readonly health: string; // W
  readonly daysLeft: number | null; // X
  readonly comment: string; // Y
  readonly projectedMediaCost: number; // Z
  readonly projectedNetProfit: number | null; // AA (A$)
  readonly projectedMargin: number | null; // AB
  /** AC: this IO's margin on what it has delivered. */
  readonly ioMargin: number | null;
  /** AD (first row): the same for all the campaign's IOs together. */
  readonly overallMargin: number | null;
}

export interface BenzingaGroupResult {
  readonly key: string;
  readonly type: BuyingType;
  readonly rows: readonly BenzingaRow[];
  readonly head: BenzingaRow;
}

export interface BenzingaResult {
  readonly rows: readonly BenzingaRow[];
  readonly groups: readonly BenzingaGroupResult[];
  /** Campaigns ending within urgentDays, soonest first. */
  readonly urgent: readonly BenzingaGroupResult[];
  /** Campaigns whose projected margin is below minMargin and not yet ended, lowest first. */
  readonly marginIssues: readonly BenzingaGroupResult[];
  readonly counts: Readonly<Record<BuyingType, number>>;
  readonly warnings: readonly string[];
  readonly today: number;
}

export const NO_VIEWS_COMMENT = 'CPCV: views are not in the DV360 CSV – pacing not calculated';
export const NO_TRACKER_COMMENT = 'Not in the Benzinga (US) tab – target not calculated';

/** Campaign Health (column W). Works the same for clicks and impressions. */
export function campaignHealth(
  start: number | null,
  end: number | null,
  total: number | null,
  achieved: number,
  today: number,
  config: Pick<BenzingaConfig, 'paceAhead' | 'paceOnTrack' | 'paceBehind'>,
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

/** (revenue − media − platform fee − Nova fee on impressions spent) ÷ revenue, all A$. Blank without revenue. */
export function deliveredMargin(revenueAud: number | null, mediaCost: number, impressions: number, config: Pick<BenzingaConfig, 'fsRate' | 'novaCpm'>): number | null {
  if (revenueAud == null || revenueAud <= 0) return null;
  return (revenueAud - mediaCost * (1 + config.fsRate) - (impressions / 1000) * config.novaCpm) / revenueAud;
}

const sumOrNull = (values: readonly (number | null)[]) => (values.some((v) => v != null) ? sumBlanks(values) : null);

/**
 * Tracker rows → campaigns. Rows that only split one campaign by month (e.g. "Financial Display Campaign" and
 * "Financial Display Campaign October") are added together: targets and budgets summed, the A$ budget is each
 * row's US$ × its own rate, dates run from the earliest start to the latest end.
 */
export function mergeTargets(targets: ReadonlyMap<string, BenzingaTarget>, config: Pick<BenzingaConfig, 'clientCpcUsd'>): Map<string, CampaignTarget> {
  const keys = [...targets.keys()];
  const parts = new Map<string, BenzingaTarget[]>();
  for (const key of keys) {
    const base = monthlyBase(key, keys) ?? key;
    const list = parts.get(base) ?? [];
    if (!parts.has(base)) parts.set(base, list);
    // The un-suffixed row (if any) goes first, so its Buying Type wins.
    const t = targets.get(key);
    if (t && key === base) list.unshift(t);
    else if (t) list.push(t);
  }
  const out = new Map<string, CampaignTarget>();
  for (const [key, rows] of parts) {
    const typed = rows.find((r) => r.buyingType != null)?.buyingType ?? null;
    const type: BuyingType = typed ?? 'CPC';
    const usdOf = (r: BenzingaTarget) => (type === 'CPC' ? (r.target != null ? r.target * config.clientCpcUsd : r.budgetUsd) : r.budgetUsd);
    const usd = rows.map(usdOf);
    const budgetUsd = sumOrNull(usd);
    const allRated = rows.every((r, i) => usd[i] == null || r.fx != null);
    const budgetAud = budgetUsd == null || !allRated ? null : sumBlanks(rows.map((r, i) => (usd[i] == null ? null : (usd[i] as number) * (r.fx as number))));
    const starts = rows.map((r) => r.start).filter((v): v is number => v != null);
    const ends = rows.map((r) => r.end).filter((v): v is number => v != null);
    out.set(key, {
      start: starts.length ? Math.min(...starts) : null,
      end: ends.length ? Math.max(...ends) : null,
      target: sumOrNull(rows.map((r) => r.target)),
      type,
      typeKnown: typed != null,
      budgetUsd,
      budgetAud,
      fx: budgetAud != null && budgetUsd ? budgetAud / budgetUsd : null,
      parts: rows.length,
    });
  }
  return out;
}

type Draft = Omit<BenzingaRow, 'netProfitAud' | 'netProfitUsd' | 'margin' | 'projectedNetProfit' | 'projectedMargin' | 'ioMargin' | 'overallMargin'>;

export function calculateBenzinga(input: BenzingaInput, config: BenzingaConfig): BenzingaResult {
  const { today } = input;
  const warnings: string[] = [];
  const out: BenzingaGroupResult[] = [];
  const campaigns = mergeTargets(input.targets, config);

  for (const g of groupBenzingaCampaigns(input.rows, [...campaigns.keys()])) {
    const firstName = g.members[0]?.item.name ?? g.key;
    const t = g.matched ? campaigns.get(g.key) : undefined;
    const type: BuyingType = t?.type ?? 'CPC';

    if (!t) warnings.push(`No row in the Benzinga (US) tab for "${firstName}". Its target and budget are left blank.`);
    else {
      if (!t.typeKnown) warnings.push(`No Buying Type in the tracker for "${firstName}"; treated as CPC.`);
      if (type === 'CPCV') warnings.push(`"${firstName}" is CPCV: views are not in the DV360 CSV, so pacing and IO margins are left blank.`);
      else if (t.target == null) warnings.push(`No View/Click Target in the tracker for "${firstName}".`);
      if (type !== 'CPC' && t.budgetUsd == null) warnings.push(`No Budget (USD) in the tracker for ${type} campaign "${firstName}". Margin is not calculated.`);
      if (t.budgetUsd != null && t.fx == null) warnings.push(`No USD → AUD rate in the tracker for "${firstName}". Margin is not calculated.`);
    }

    // One target per campaign, on its first IO. Every IO's delivery counts towards it; what is still needed
    // (Total, without the buffer, minus every IO's delivery) is shown once, on the last IO.
    const paced = t != null && type !== 'CPCV';
    const achievedOf = (r: Dv360Row) => (type === 'CPM' ? r.impressions : type === 'CPC' ? r.clicks : null);
    const groupTotal = paced ? t.target : null;
    const groupAchieved = sumBlanks(g.members.map((m) => achievedOf(m.item)));
    const groupRequired = groupTotal == null ? null : Math.max(groupTotal - groupAchieved, 0);
    const start = t?.start ?? null;
    const end = t?.end ?? null;

    const partial: Draft[] = g.members.map((m, i) => {
      const isHead = i === 0;
      const isLatest = i === g.members.length - 1;
      const { clicks, impressions, cost: N } = m.item;
      const E = isHead ? (t?.target ?? null) : null;
      const H = isLatest ? groupRequired : null;
      const K = impressions === 0 ? null : clicks / impressions;
      const L = H == null ? null : type === 'CPM' ? H : K == null || K === 0 ? null : sheetRound(H / K, 0);
      const M = L == null ? null : impressions + L;
      // The latest IO is costed on the impressions it still needs; earlier IOs (and a latest IO with nothing to
      // work out) on what they have spent.
      const P = ((isLatest && M != null ? M : impressions) / 1000) * config.novaCpm;
      const Q = isHead && t ? (type === 'CPC' ? (E == null ? null : E * config.clientCpcUsd) : t.budgetUsd) : null;
      const R = isHead && t ? t.fx : null;
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
        totalTarget: E,
        targeted: E == null ? null : sheetRound(E + E * config.targetBuffer, 0),
        achieved: achievedOf(m.item),
        required: H,
        clicks,
        impressions,
        ctr: K,
        impressionsNeeded: L,
        impressionsTotal: M,
        mediaCost: N,
        fsFee: N * config.fsRate,
        novaFee: P,
        budgetUsd: Q,
        fx: R,
        budgetAud: Q != null && R != null ? Q * R : null,
        health: campaignHealth(start, end, groupTotal, groupAchieved, today, config),
        daysLeft: daysLeft(end, today),
        comment,
        projectedMediaCost: isLatest && impressions > 0 && M != null ? (N / impressions) * M : N,
      };
    });

    const head = partial[0];
    if (!head) continue;
    const sumN = sumBlanks(partial.map((r) => r.mediaCost));
    const sumO = sumBlanks(partial.map((r) => r.fsFee));
    const sumP = sumBlanks(partial.map((r) => r.novaFee));
    const sumZ = sumBlanks(partial.map((r) => r.projectedMediaCost));
    const S = head.budgetAud;
    const hasBudget = S != null && S !== 0;

    // Revenue in A$: CPC = clicks × US$ CPC × rate; CPM = impressions at the campaign's A$ rate (budget ÷ target).
    const revenueOf = (clicks: number, impressions: number): number | null => {
      if (type === 'CPC') return head.fx == null ? null : clicks * config.clientCpcUsd * head.fx;
      if (type === 'CPM') return S == null || !head.totalTarget ? null : (impressions * S) / head.totalTarget;
      return null;
    };
    const overall = deliveredMargin(revenueOf(sumBlanks(partial.map((r) => r.clicks)), sumBlanks(partial.map((r) => r.impressions))), sumN, sumBlanks(partial.map((r) => r.impressions)), config);

    const rows: BenzingaRow[] = partial.map((r) => {
      const T = r.isHead && hasBudget ? S - sumN - sumO - sumP : null;
      const AA = r.isHead && hasBudget ? S - sumZ * (1 + config.fsRate) - sumP : null;
      return {
        ...r,
        netProfitAud: T,
        netProfitUsd: T == null || !r.fx ? null : T / r.fx,
        margin: T == null || S == null ? null : T / S,
        projectedNetProfit: AA,
        projectedMargin: AA == null || S == null ? null : AA / S,
        ioMargin: deliveredMargin(revenueOf(r.clicks, r.impressions), r.mediaCost, r.impressions, config),
        overallMargin: r.isHead ? overall : null,
      };
    });
    out.push({ key: g.key, type, rows, head: rows[0] as BenzingaRow });
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

  const count = (type: BuyingType) => out.filter((g) => g.type === type).length;
  return {
    rows: out.flatMap((g) => g.rows),
    groups: out,
    urgent,
    marginIssues,
    counts: { CPC: count('CPC'), CPM: count('CPM'), CPCV: count('CPCV') },
    warnings,
    today,
  };
}
