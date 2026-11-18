import type { SheetCell, SheetSpec } from '../types';
import type { BusinessInsiderConfig } from './config';
import type { BusinessInsiderResult, BusinessInsiderRow } from './rules';

/**
 * The Business Insider Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet (Nova % included) still recalculates. Rates come from the config.
 *
 * Column order: clicks, impressions (total, Nova, non-Nova, Nova %), Health and days left, the four margins side by
 * side, costs, US$/A$ budget and profit, Comment last. Every formula takes its letters from BI_COLUMNS.
 */
export const BI_COLUMNS = [
  ['name', 'Campaign name'],
  ['start', 'Start date'],
  ['end', 'End date'],
  ['total', 'Total Clicks'],
  ['targeted', 'Targeted Clicks'],
  ['achieved', 'Achieved Clicks'],
  ['required', 'Required Clicks (without extra)'],
  ['ctr', 'Actual Average CTR'],
  ['impressions', 'Total Impressions'],
  ['novaImpr', 'Nova Impressions'],
  ['nonNovaImpr', 'Non-Nova Impressions'],
  ['novaShare', 'Nova %'],
  ['imprNeeded', 'Impression needed for required clicks'],
  ['imprTotal', 'Required Total Impression'],
  ['health', 'Campaign Health'],
  ['days', 'Remaining Days'],
  ['margin', 'Margin %'],
  ['projMargin', 'Projected Margin %'],
  ['ioMargin', 'IO Margin %'],
  ['overallMargin', 'Overall Margin %'],
  ['media', 'Inventory cost (AUD)'],
  ['fs', 'DV360/FS platform fee (AUD)'],
  ['nova', 'Nova fee (AUD)'],
  ['budgetUsd', 'Budget (USD)'],
  ['fx', 'USD → AUD rate'],
  ['budgetAud', 'Budget (AUD)'],
  ['netAud', 'Net profit (AUD)'],
  ['netUsd', 'Net profit (USD)'],
  ['projMedia', 'Projected Media Cost (AUD)'],
  ['projNet', 'Projected Net Profit (AUD)'],
  ['comment', 'Comment'],
  ['gap', ''],
  ['updated', 'Last Updated:'],
  ['groupKey', 'Group Key'],
] as const;

export type BiColumn = (typeof BI_COLUMNS)[number][0];

const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** 0-based index of each column. */
export const BI_COL = Object.fromEntries(BI_COLUMNS.map(([k], i) => [k, i])) as Record<BiColumn, number>;
/** Letter of each column, e.g. BI_LETTER.novaShare = "L". */
export const BI_LETTER = Object.fromEntries(BI_COLUMNS.map(([k], i) => [k, letter(i)])) as Record<BiColumn, string>;

export const BI_HEADERS = BI_COLUMNS.map(([, h]) => h);
/** Data columns written on every tab (A … Comment). */
export const BI_DATA_COLUMNS = BI_COL.comment + 1;
/** Column of the group key (1-based); it is hidden. */
export const BI_GROUP_KEY_COLUMN = BI_COL.groupKey + 1;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const shortPct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;
const L = BI_LETTER;

/** Hover notes: Required, Nova %, the fee, the A$ budget, and what each of the four margins shows. */
export function headerNotes(c: Pick<BusinessInsiderConfig, 'targetBuffer' | 'fsRate' | 'novaCpm' | 'minMargin' | 'novaShare'>): Record<number, string> {
  const fsUp = (1 + c.fsRate).toFixed(4);
  const nova = `Nova impressions ÷ 1000 × A$${c.novaCpm.toFixed(2)}`;
  return {
    [BI_COL.required]: `Clicks still needed = Total Clicks − every IO's Achieved Clicks. Does not include the ${pct(c.targetBuffer)} extra in Targeted Clicks. Shown on the campaign's last IO.`,
    [BI_COL.novaShare]: `Share of impressions that carry the Nova fee (Nova creatives). Default ${shortPct(c.novaShare)}: Business Insider runs DV360 creatives. Change it on the campaign's first row and the Nova fee, profit and margins recalculate, including for the impressions still to come.`,
    [BI_COL.fs]: `(Inventory cost ÷ 1.1) × 4.5% = ${+(c.fsRate * 100).toFixed(4)}% of inventory cost, as in the Campaign Tracker.`,
    [BI_COL.budgetAud]: "From the Campaign Tracker's Budget (AUD): the client's US$ budget × the USD → AUD rate. Every margin is worked out in A$.",
    [BI_COL.margin]:
      'Shows: how much of the full Budget (AUD) is left after the media spent so far, the platform fee and the Nova fee.\n' +
      'Formula: (Budget (AUD) − media spent − platform fee − Nova fee) ÷ Budget (AUD)\n' +
      'When to use: a quick look only. It starts high and falls as the campaign spends. Use Projected Margin % for decisions.',
    [BI_COL.projMargin]:
      "Shows: the margin when the campaign finishes, if the rest is bought at today's CTR and CPM.\n" +
      `Formula: (Budget (AUD) − projected media × ${fsUp} − Nova fee) ÷ Budget (AUD)\n` +
      `When to use: the main number for decisions. Below ${shortPct(c.minMargin)} → Margin Issue tab.`,
    [BI_COL.ioMargin]:
      "Shows: this IO's own margin on what it has delivered so far.\n" +
      `Formula: (clicks × A$ per click − media × ${fsUp} − ${nova}) ÷ (clicks × A$ per click), where A$ per click = Budget (AUD) ÷ Click Target\n` +
      'When to use: to find which IO is losing money, then pause it or move budget.',
    [BI_COL.overallMargin]:
      "Shows: the same as IO Margin %, for all the campaign's IOs together (on its first row).\n" +
      'Formula: the same as IO Margin %, added up over every IO\n' +
      "When to use: to check whether today's delivery is profitable overall.",
  };
}

/**
 * Campaign Health for row x. `tgt` is the campaign's Total Clicks (first IO, no buffer) and `ach` all its IOs' clicks,
 * so every IO of a campaign shows the campaign's pace and the clicks still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: BusinessInsiderConfig): string {
  const st = `${L.start}${x}`;
  const en = `${L.end}${x}`;
  const pace = `((TODAY()-${st}+1)/(${en}-${st}+1))`;
  const perDay = `ROUND((${tgt}-${ach})/MAX(1,${en}-TODAY()),0)&"/day"`;
  return (
    `=IF(OR(${tgt}="",${st}="",${en}=""),"",IF(${ach}>=${tgt},"🟢 Completed",IF(TODAY()<${st},"Not Started",IF(TODAY()>${en},"Ended",` +
    `IF((${ach}/${tgt})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay})))))))`
  );
}

/** `h` is the sheet row of the campaign's first IO (it holds the target, budgets and Nova %). */
function rowCells(r: BusinessInsiderRow, x: number, h: number, c: BusinessInsiderConfig): SheetCell[] {
  const at = (k: BiColumn) => `${L[k]}${x}`;
  const sumIf = (k: BiColumn) => `SUMIF($${L.groupKey}$2:$${L.groupKey},$${L.groupKey}${x},$${L[k]}$2:$${L[k]})`;
  const fsUp = `(1+${c.fsRate})`;
  const share = `N($${L.novaShare}$${h})`; // the campaign's Nova %, blank = 0
  // Revenue in A$: clicks × (Budget (AUD) ÷ Click Target), both on the campaign's first row.
  const revenue = (clicks: string) => `${clicks}*$${L.budgetAud}$${h}/$${L.total}$${h}`;
  const margin = (clicks: string, media: string, novaImpr: string) =>
    `=IFERROR((${revenue(clicks)}-${media}*${fsUp}-(${novaImpr}/1000)*${c.novaCpm})/(${revenue(clicks)}),"")`;
  const aud = at('budgetAud');
  const noBudget = `OR(${aud}="",${aud}=0)`;
  // Still needed and Health count from the Total Clicks (no buffer), minus every IO's clicks.
  const tgt = `$${L.total}$${h}`;
  const ach = sumIf('achieved');
  const total = at('total');

  const v: Record<BiColumn, string | number | null> = {
    name: r.name,
    start: r.start,
    end: r.end,
    // A follow-on IO's own Total: Total − the clicks of every IO above it (rows h … x−1).
    total: r.isHead ? r.totalClicks : `=IF(${tgt}="","",MAX(${tgt}-SUM($${L.achieved}$${h}:${L.achieved}${x - 1}),0))`,
    targeted: `=IF(${total}="","",ROUND(${total}+(${total}*${pct(c.targetBuffer)}),0))`,
    achieved: r.achievedClicks,
    required: r.isLatest ? iferror(`=IF(${tgt}="","",MAX(${tgt}-${ach},0))`) : null, // still needed, last IO only
    ctr: iferror(`=IF(OR(${at('achieved')}="",${at('impressions')}="",${at('impressions')}=0),"",${at('achieved')}/${at('impressions')})`),
    impressions: r.impressions,
    novaImpr: `=${at('impressions')}*${share}`,
    nonNovaImpr: `=${at('impressions')}-${at('novaImpr')}`,
    novaShare: r.isHead ? r.novaShare : null,
    imprNeeded: r.isLatest ? iferror(`=IF(OR(${at('required')}="",${at('ctr')}="",${at('ctr')}=0),"",ROUND(${at('required')}/${at('ctr')},0))`) : null,
    imprTotal: r.isLatest ? iferror(`=IF(OR(${at('impressions')}="",${at('imprNeeded')}=""),"",${at('impressions')}+${at('imprNeeded')})`) : null,
    health: iferror(healthFormula(x, tgt, ach, c)),
    days: r.end == null ? null : `=MAX(0,ROUNDUP(${at('end')}-TODAY(),0))`,
    margin: r.isHead ? `=IF(${at('netAud')}="","",${at('netAud')}/${aud})` : null,
    projMargin: r.isHead ? `=IF(${at('projNet')}="","",${at('projNet')}/${aud})` : null,
    ioMargin: margin(at('achieved'), at('media'), at('novaImpr')),
    overallMargin: r.isHead ? margin(sumIf('achieved'), sumIf('media'), sumIf('novaImpr')) : null,
    media: r.mediaCost,
    fs: `=${at('media')}*${pct(c.fsRate)}`,
    // Nova only on the Nova share. The latest IO is costed on the impressions it still needs; earlier IOs on what they spent.
    nova: r.isLatest
      ? `=(IF(${at('imprTotal')}="",${at('impressions')},${at('imprTotal')})*${share}/1000)*${c.novaCpm}`
      : `=(${at('impressions')}*${share}/1000)*${c.novaCpm}`,
    budgetUsd: r.isHead ? r.budgetUsd : null,
    fx: r.isHead ? r.fx : null,
    budgetAud: r.isHead ? r.budgetAud : null,
    netAud: r.isHead ? `=IF(${noBudget},"",${aud}-${sumIf('media')}-${sumIf('fs')}-${sumIf('nova')})` : null,
    netUsd: r.isHead ? `=IF(OR(${at('netAud')}="",${at('fx')}="",${at('fx')}=0),"",${at('netAud')}/${at('fx')})` : null,
    projMedia: r.isLatest
      ? `=IFERROR(IF(${at('impressions')}>0,${at('media')}/${at('impressions')}*${at('imprTotal')},${at('media')}),${at('media')})`
      : `=${at('media')}`,
    projNet: r.isHead ? `=IF(${noBudget},"",${aud}-${sumIf('projMedia')}*${fsUp}-${sumIf('nova')})` : null,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return BI_COLUMNS.map(([k]) => ({ value: v[k] }));
}

/** Calculated values for the Urgent / Margin Issue tabs (A … Comment), in the Report's column order. */
export function businessInsiderRowValues(r: BusinessInsiderRow): (number | string | null)[] {
  const v: Record<BiColumn, number | string | null> = {
    name: r.name,
    start: r.start,
    end: r.end,
    total: r.totalClicks,
    targeted: r.targetedClicks,
    achieved: r.achievedClicks,
    required: r.requiredClicks,
    ctr: r.ctr,
    impressions: r.impressions,
    novaImpr: r.novaImpressions,
    nonNovaImpr: r.nonNovaImpressions,
    novaShare: r.novaShare,
    imprNeeded: r.impressionsNeeded,
    imprTotal: r.impressionsTotal,
    health: r.health || null,
    days: r.daysLeft,
    margin: r.margin,
    projMargin: r.projectedMargin,
    ioMargin: r.ioMargin,
    overallMargin: r.overallMargin,
    media: r.mediaCost,
    fs: r.fsFee,
    nova: r.novaFee,
    budgetUsd: r.budgetUsd,
    fx: r.fx,
    budgetAud: r.budgetAud,
    netAud: r.netProfitAud,
    netUsd: r.netProfitUsd,
    projMedia: r.projectedMediaCost,
    projNet: r.projectedNetProfit,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return BI_COLUMNS.slice(0, BI_DATA_COLUMNS).map(([k]) => v[k]);
}

export function buildBusinessInsiderSheetSpec(result: BusinessInsiderResult, config: BusinessInsiderConfig, title = 'Report'): SheetSpec {
  let head = 2;
  return {
    title,
    headers: BI_HEADERS,
    rows: result.rows.map((r, i) => {
      if (r.isHead) head = i + 2;
      return rowCells(r, i + 2, head, config);
    }),
    hiddenColumns: [BI_GROUP_KEY_COLUMN],
    headerNotes: headerNotes(config),
  };
}
