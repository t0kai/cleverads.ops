import type { SheetCell, SheetSpec } from '../types';
import type { UfurnishConfig } from './config';
import type { UfurnishResult, UfurnishRow } from './rules';

/**
 * The Ufurnish Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Ufurnish config.
 *
 * Column order: delivery, then Health and days left, then the four margins side by side,
 * then costs, £/A$ budget and profit, Comment last. Every formula takes its letters from UFURNISH_COLUMNS.
 */
export const UFURNISH_COLUMNS = [
  ['name', 'Campaign name'],
  ['type', 'Buying Type'],
  ['start', 'Start date'],
  ['end', 'End date'],
  ['total', 'Total target'],
  ['targeted', 'Targeted'],
  ['achieved', 'Achieved'],
  ['required', 'Required (without extra)'],
  ['clicks', 'Clicks'],
  ['impressions', 'Impressions spent'],
  ['ctr', 'Actual Average CTR'],
  ['imprNeeded', 'Impressions needed'],
  ['imprTotal', 'Required Total Impression'],
  ['health', 'Campaign Health'],
  ['days', 'Remaining Days'],
  ['margin', 'Margin %'],
  ['projMargin', 'Projected Margin %'],
  ['ioMargin', 'IO Margin %'],
  ['overallMargin', 'Overall Margin %'],
  ['media', 'Inventory cost (AUD)'],
  ['fs', 'FS Service fee (AUD)'],
  ['nova', 'Nova fee (AUD)'],
  ['budgetGbp', 'Budget (GBP)'],
  ['budgetAud', 'Budget (AUD)'],
  ['netProfit', 'Net profit (AUD)'],
  ['projMedia', 'Projected Media Cost (AUD)'],
  ['projNet', 'Projected Net Profit (AUD)'],
  ['comment', 'Comment'],
  ['gap', ''],
  ['updated', 'Last Updated:'],
  ['groupKey', 'Group Key'],
] as const;

export type UfurnishColumn = (typeof UFURNISH_COLUMNS)[number][0];

const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** 0-based index of each column. */
export const UFURNISH_COL = Object.fromEntries(UFURNISH_COLUMNS.map(([k], i) => [k, i])) as Record<UfurnishColumn, number>;
/** Letter of each column, e.g. UFURNISH_LETTER.media = "T". */
export const UFURNISH_LETTER = Object.fromEntries(UFURNISH_COLUMNS.map(([k], i) => [k, letter(i)])) as Record<UfurnishColumn, string>;

export const UFURNISH_HEADERS = UFURNISH_COLUMNS.map(([, h]) => h);
/** Data columns written on every tab (A … Comment). */
export const UFURNISH_DATA_COLUMNS = UFURNISH_COL.comment + 1;
/** Column of the group key (1-based); it is hidden. */
export const UFURNISH_GROUP_KEY_COLUMN = UFURNISH_COL.groupKey + 1;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const shortPct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;
const L = UFURNISH_LETTER;

/** Hover notes: Required, the A$ budget, and what each of the four margins shows, its formula and when to look at it. */
export function headerNotes(c: Pick<UfurnishConfig, 'targetBuffer' | 'fsRate' | 'novaCpm' | 'minMargin'>): Record<number, string> {
  const fsUp = (1 + c.fsRate).toFixed(2);
  return {
    [UFURNISH_COL.required]: `Clicks still needed = Total target − every IO's Achieved clicks (IO + IO 2 + IO 3). Does not include the ${pct(c.targetBuffer)} extra in Targeted. Shown on the campaign's last IO. Blank for CPCV: views are not in the DV360 CSV.`,
    [UFURNISH_COL.budgetAud]: 'From the Campaign Tracker\'s Budget (AUD): the client\'s £ budget converted to A$. Every margin is worked out in A$.',
    [UFURNISH_COL.margin]:
      'Shows: how much of the full Budget (AUD) is left after the media spent so far, the FS fee and the Nova fee.\n' +
      'Formula: (Budget (AUD) − media spent − FS fee − Nova fee) ÷ Budget (AUD)\n' +
      'When to use: a quick look only. It starts high and falls as the campaign spends. Use Projected Margin % for decisions.',
    [UFURNISH_COL.projMargin]:
      "Shows: the margin when the campaign finishes, if the rest is bought at today's CTR and CPM.\n" +
      `Formula: (Budget (AUD) − projected media × ${fsUp} − Nova fee) ÷ Budget (AUD)\n` +
      `When to use: the main number for decisions. Below ${shortPct(c.minMargin)} → Margin Issue tab.`,
    [UFURNISH_COL.ioMargin]:
      "Shows: this IO's own margin on what it has delivered so far. Blank for CPCV (views are not in the CSV).\n" +
      `Formula: (clicks × A$ per click − media × ${fsUp} − impressions ÷ 1000 × A$${c.novaCpm.toFixed(2)}) ÷ (clicks × A$ per click), where A$ per click = Budget (AUD) ÷ click target\n` +
      'When to use: to find which IO is losing money, then pause it or move budget.',
    [UFURNISH_COL.overallMargin]:
      "Shows: the same as IO Margin %, for all the campaign's IOs together (on its first row).\n" +
      'Formula: the same as IO Margin %, added up over every IO\n' +
      "When to use: to check whether today's delivery is profitable overall.",
  };
}

/**
 * Campaign Health for row x. `tgt` is the campaign's Total target (first IO, no buffer) and `ach` all its IOs' clicks,
 * so every IO of a campaign shows the campaign's pace and the clicks still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: UfurnishConfig): string {
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

/** `h` is the sheet row of the campaign's first IO (it holds the target and budgets). */
function rowCells(r: UfurnishRow, x: number, h: number, c: UfurnishConfig): SheetCell[] {
  const at = (k: UfurnishColumn) => `${L[k]}${x}`;
  const sumIf = (k: UfurnishColumn) => `SUMIF($${L.groupKey}$2:$${L.groupKey},$${L.groupKey}${x},$${L[k]}$2:$${L[k]})`;
  const fsUp = `(1+${c.fsRate})`;
  const type = `$${L.type}${x}`;
  // Revenue in A$: clicks × (Budget (AUD) ÷ click target), both on the campaign's first row. CPCV: blank.
  const revenue = (clicks: string) => `IF(${type}="CPC",${clicks}*$${L.budgetAud}$${h}/$${L.total}$${h},"")`;
  const margin = (rev: string, media: string, impressions: string) => `=IFERROR((${rev}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${rev}),"")`;
  const aud = at('budgetAud');
  const noBudget = `OR(${aud}="",${aud}=0)`;
  // Still needed and Health count from the Total target (no buffer), minus every IO's clicks.
  const tgt = `$${L.total}$${h}`;
  const ach = sumIf('achieved');
  const total = at('total');

  const v: Record<UfurnishColumn, string | number | null> = {
    name: r.name,
    type: r.type,
    start: r.start,
    end: r.end,
    // A follow-on IO's own Total: Total − the clicks of every IO above it (rows h … x−1). CPCV: no clicks to count.
    total: r.isHead ? r.totalTarget : r.type === 'CPCV' ? null : `=IF(${tgt}="","",MAX(${tgt}-SUM($${L.achieved}$${h}:${L.achieved}${x - 1}),0))`,
    targeted: `=IF(${total}="","",ROUND(${total}+(${total}*${pct(c.targetBuffer)}),0))`,
    achieved: `=IF(${type}="CPC",${at('clicks')},"")`,
    required: r.isLatest ? iferror(`=IF(OR(${type}="CPCV",${tgt}=""),"",MAX(${tgt}-${ach},0))`) : null, // still needed, last IO only
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: iferror(`=IF(OR(${at('clicks')}="",${at('impressions')}="",${at('impressions')}=0),"",${at('clicks')}/${at('impressions')})`),
    imprNeeded: r.isLatest ? iferror(`=IF(OR(${at('required')}="",${at('ctr')}="",${at('ctr')}=0),"",ROUND(${at('required')}/${at('ctr')},0))`) : null,
    imprTotal: r.isLatest ? iferror(`=IF(OR(${at('impressions')}="",${at('imprNeeded')}=""),"",${at('impressions')}+${at('imprNeeded')})`) : null,
    health: r.type === 'CPCV' ? null : iferror(healthFormula(x, tgt, ach, c)),
    days: r.end == null ? null : `=MAX(0,ROUNDUP(${at('end')}-TODAY(),0))`,
    margin: r.isHead ? `=IF(${at('netProfit')}="","",${at('netProfit')}/${aud})` : null,
    projMargin: r.isHead ? `=IF(${at('projNet')}="","",${at('projNet')}/${aud})` : null,
    ioMargin: margin(revenue(at('clicks')), at('media'), at('impressions')),
    overallMargin: r.isHead ? margin(revenue(sumIf('clicks')), sumIf('media'), sumIf('impressions')) : null,
    media: r.mediaCost,
    fs: `=${at('media')}*${pct(c.fsRate)}`,
    // The latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    nova: r.isLatest
      ? `=(IF(${at('imprTotal')}="",${at('impressions')},${at('imprTotal')})/1000)*${c.novaCpm}`
      : `=(${at('impressions')}/1000)*${c.novaCpm}`,
    budgetGbp: r.isHead ? r.budgetGbp : null,
    budgetAud: r.isHead ? r.budgetAud : null,
    netProfit: r.isHead ? `=IF(${noBudget},"",${aud}-${sumIf('media')}-${sumIf('fs')}-${sumIf('nova')})` : null,
    projMedia: r.isLatest
      ? `=IFERROR(IF(${at('impressions')}>0,${at('media')}/${at('impressions')}*${at('imprTotal')},${at('media')}),${at('media')})`
      : `=${at('media')}`,
    projNet: r.isHead ? `=IF(${noBudget},"",${aud}-${sumIf('projMedia')}*${fsUp}-${sumIf('nova')})` : null,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return UFURNISH_COLUMNS.map(([k]) => ({ value: v[k] }));
}

/** Calculated values for the Urgent / Margin Issue tabs (A … Comment), in the Report's column order. */
export function ufurnishRowValues(r: UfurnishRow): (number | string | null)[] {
  const v: Record<UfurnishColumn, number | string | null> = {
    name: r.name,
    type: r.type,
    start: r.start,
    end: r.end,
    total: r.totalTarget,
    targeted: r.targeted,
    achieved: r.achieved,
    required: r.required,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
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
    budgetGbp: r.budgetGbp,
    budgetAud: r.budgetAud,
    netProfit: r.netProfit,
    projMedia: r.projectedMediaCost,
    projNet: r.projectedNetProfit,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return UFURNISH_COLUMNS.slice(0, UFURNISH_DATA_COLUMNS).map(([k]) => v[k]);
}

export function buildUfurnishSheetSpec(result: UfurnishResult, config: UfurnishConfig, title = 'Report'): SheetSpec {
  let head = 2;
  return {
    title,
    headers: UFURNISH_HEADERS,
    rows: result.rows.map((r, i) => {
      if (r.isHead) head = i + 2;
      return rowCells(r, i + 2, head, config);
    }),
    hiddenColumns: [UFURNISH_GROUP_KEY_COLUMN],
    headerNotes: headerNotes(config),
  };
}
