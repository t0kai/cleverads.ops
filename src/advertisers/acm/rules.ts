import type { Dv360Row } from '@/engine/csv/dv360';
import { groupCampaigns } from '@/engine/grouping/groupCampaigns';
import { normalizeKey } from '@/engine/grouping/names';
import { sheetRound, sheetRoundUp, sumBlanks } from '@/engine/math/sheetMath';
import type { ModuleInput, TargetRow } from '../types';
import type { AcmConfig } from './config';

/**
 * One report row. Letters are the sheet columns; null = blank cell.
 * Every value mirrors the formula the sheet will hold, so the screen and the sheet agree.
 */
export interface AcmRow {
  readonly name: string; // A
  readonly groupKey: string; // Z (hidden)
  readonly isChild: boolean; // a 2nd/3rd IO
  readonly isHead: boolean; // first row of its group (holds Budget/Profit/Margin)
  readonly superseded: boolean; // a later IO is running (this row: Required 0, Health "▶ Running with 2nd")
  readonly nextLabel: string; // "2nd" when a later IO is running
  readonly start: number | null; // B (serial)
  readonly end: number | null; // C (serial)
  readonly totalClicks: number | null; // D
  readonly targetedClicks: number | null; // E
  readonly achievedClicks: number; // F
  readonly requiredClicks: number | null; // G
  readonly ctr: number | null; // H
  readonly impressions: number; // I
  readonly impressionsNeeded: number | null; // J
  readonly impressionsTotal: number | null; // K
  readonly mediaCost: number; // L
  readonly fsFee: number | null; // M
  readonly novaFee: number | null; // N
  readonly budget: number | null; // O
  readonly netProfit: number | null; // P
  readonly margin: number | null; // Q
  readonly health: string; // R
  readonly daysLeft: number | null; // S
  readonly comment: string; // T
  readonly projectedMediaCost: number | null; // U
  readonly projectedNetProfit: number | null; // V
  readonly projectedMargin: number | null; // W
}

export interface AcmGroupResult {
  readonly key: string;
  readonly rows: readonly AcmRow[];
  readonly head: AcmRow;
}

export interface AcmResult {
  readonly rows: readonly AcmRow[];
  readonly groups: readonly AcmGroupResult[];
  /** Groups ending within urgentDays, soonest first. */
  readonly urgent: readonly AcmGroupResult[];
  /** Groups whose projected margin is below minMargin and not yet ended, lowest first. */
  readonly marginIssues: readonly AcmGroupResult[];
  readonly warnings: readonly string[];
  readonly today: number;
}

const EMPTY_TARGET: TargetRow = { start: null, end: null, clicks: null };

/** Campaign Health, same bands as the template's column R. */
export function campaignHealth(
  start: number | null,
  end: number | null,
  targeted: number | null,
  achieved: number,
  today: number,
  config: Pick<AcmConfig, 'paceAhead' | 'paceOnTrack' | 'paceBehind'>,
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

interface Draft {
  row: Dv360Row;
  isChild: boolean;
  indexInGroup: number;
  superseded: boolean;
  nextLabel: string;
  start: number | null;
  end: number | null;
  total: number | null;
  comment: string;
}

export function calculateAcm(input: ModuleInput, config: AcmConfig): AcmResult {
  const { today } = input;
  const warnings: string[] = [];
  const groups = groupCampaigns(input.rows);
  const out: AcmGroupResult[] = [];

  for (const g of groups) {
    const parent = input.targets.get(g.key) ?? EMPTY_TARGET;
    if (g.hasMain && parent.clicks == null) {
      warnings.push(`No click target in the Campaign Tracker for "${g.members[0]?.item.name ?? g.key}".`);
    }

    // Columns B–D and the flags, as in buildRows_() of the Apps Script.
    const drafts: Draft[] = g.members.map((m, i) => {
      const isChild = m.order > 1;
      const own = input.targets.get(normalizeKey(m.item.name)) ?? EMPTY_TARGET;
      let start: number | null;
      let end: number | null;
      let total: number | null;
      if (!isChild) {
        start = parent.start;
        end = parent.end;
        total = parent.clicks;
      } else {
        // A 2nd/3rd IO starts on the main campaign's start date (decided 3 Oct 2026) and ends with it,
        // unless the tracker has its own end date.
        start = parent.start;
        end = own.end ?? parent.end;
        total = null;
      }
      const next = g.members[i + 1];
      return {
        row: m.item,
        isChild,
        indexInGroup: i,
        superseded: next !== undefined,
        nextLabel: next?.label ?? '',
        start,
        end,
        total,
        comment: isChild && !g.hasMain && i === 0 ? 'Main campaign not in CSV – target not calculated' : '',
      };
    });

    // Per-row formulas, top to bottom (a 2nd's target needs the row above).
    const partial: Omit<AcmRow, 'netProfit' | 'margin' | 'projectedNetProfit' | 'projectedMargin'>[] = [];
    drafts.forEach((d, i) => {
      const prev = partial[i - 1];
      const F = d.row.clicks;
      const I = d.row.impressions;
      const L = d.row.cost;
      const D = d.total;

      let E: number | null;
      if (!d.isChild) {
        E = D == null ? null : sheetRound(D + D * config.clickBuffer, 0);
      } else if (prev) {
        E = prev.targetedClicks == null ? null : Math.max(prev.targetedClicks - prev.achievedClicks, 0);
      } else {
        E = null;
      }

      let G: number | null = E == null ? null : Math.max(E - F, 0);
      if (d.superseded) G = 0;
      const H = I === 0 ? null : F / I;
      const J = G == null || H == null || H === 0 ? null : sheetRound(G / H, 0);
      const K = J == null ? null : I + J;
      const M = L * config.fsRate;
      const N = K == null ? null : (K / 1000) * config.novaCpm;
      const O = d.isChild || D == null ? null : D * config.clientCpc;
      const U = I > 0 && K != null ? (L / I) * K : L;

      const health = d.superseded
        ? `▶ Running with ${d.nextLabel}`
        : campaignHealth(d.start, d.end, E, F, today, config);

      partial.push({
        name: d.row.name,
        groupKey: g.key,
        isChild: d.isChild,
        isHead: d.indexInGroup === 0,
        superseded: d.superseded,
        nextLabel: d.nextLabel,
        start: d.start,
        end: d.end,
        totalClicks: D,
        targetedClicks: E,
        achievedClicks: F,
        requiredClicks: G,
        ctr: H,
        impressions: I,
        impressionsNeeded: J,
        impressionsTotal: K,
        mediaCost: L,
        fsFee: M,
        novaFee: N,
        budget: O,
        health,
        daysLeft: daysLeft(d.end, today),
        comment: d.comment,
        projectedMediaCost: U,
      });
    });

    // Group totals live on the head row (one budget per main + 2nd/3rd).
    const sumL = sumBlanks(partial.map((r) => r.mediaCost));
    const sumM = sumBlanks(partial.map((r) => r.fsFee));
    const sumN = sumBlanks(partial.map((r) => r.novaFee));
    const sumU = sumBlanks(partial.map((r) => r.projectedMediaCost));

    const rows: AcmRow[] = partial.map((r) => {
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
