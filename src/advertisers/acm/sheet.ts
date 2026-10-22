import type { SheetCell, SheetSpec } from '../types';
import type { AcmConfig } from './config';
import type { AcmResult, AcmRow } from './rules';

/**
 * The Report tab as the sheet will hold it: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Formulas are the template's (Formula tab),
 * with the rates taken from config instead of being typed in.
 *
 * Column order (Oct 2026): clicks and impressions, then Health and days left, then the four margins side by side,
 * then costs and budget, Comment last. Every formula takes its letters from ACM_COLUMNS, so the order lives here only.
 */
export const ACM_COLUMNS = [
  ['name', 'Campaign name'],
  ['start', 'Start date'],
  ['end', 'End date'],
  ['total', 'Total Clicks'],
  ['targeted', 'Targeted Clicks'],
  ['achieved', 'Achieved Clicks'],
  ['required', 'Required Clicks (without extra)'],
  ['ctr', 'Actual Average CTR'],
  ['impressions', 'Impressions spent'],
  ['imprNeeded', 'Impression needed for required clicks'],
  ['imprTotal', 'Required Total Impression'],
  ['health', 'Campaign Health'],
  ['days', 'Remaining Days'],
  ['margin', 'Margin %'],
  ['projMargin', 'Projected Margin %'],
  ['ioMargin', 'IO Margin %'],
  ['overallMargin', 'Overall Margin %'],
  ['media', 'Inventory cost'],
  ['fs', 'FS Service fee'],
  ['nova', 'Nova fee'],
  ['budget', 'Budget'],
  ['netProfit', 'Net profit'],
  ['projMedia', 'Projected Media Cost'],
  ['projNet', 'Projected Net Profit'],
  ['comment', 'Comment'],
  ['gap', ''],
  ['updated', 'Last Updated:'],
  ['groupKey', 'Group Key'],
] as const;

export type AcmColumn = (typeof ACM_COLUMNS)[number][0];

const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** 0-based index of each column. */
export const ACM_COL = Object.fromEntries(ACM_COLUMNS.map(([k], i) => [k, i])) as Record<AcmColumn, number>;
/** Letter of each column, e.g. ACM_LETTER.media = "R". */
export const ACM_LETTER = Object.fromEntries(ACM_COLUMNS.map(([k], i) => [k, letter(i)])) as Record<AcmColumn, string>;

export const ACM_HEADERS = ACM_COLUMNS.map(([, h]) => h);
/** Data columns written on every tab (A … Comment). */
export const ACM_DATA_COLUMNS = ACM_COL.comment + 1;
/** Column of the group key (1-based); it is hidden. */
export const GROUP_KEY_COLUMN = ACM_COL.groupKey + 1;
/** Column G (0-based 6): what the campaign still needs. */
export const ACM_REQUIRED_COLUMN = ACM_COL.required;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const shortPct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

/** Hover note on the Required Clicks header, so anyone reading the sheet knows the extra is left out. */
export const requiredNote = (c: Pick<AcmConfig, 'clickBuffer'>) =>
  `Clicks still needed = Total Clicks − every IO's Achieved Clicks (main + 2nd + 3rd). Does not include the ${pct(c.clickBuffer)} extra in Targeted Clicks. Shown on the campaign's last IO.`;

/** Hover notes on the four margin headers: what each shows, its formula, and when to look at it. */
export function marginNotes(c: Pick<AcmConfig, 'clientCpc' | 'fsRate' | 'novaCpm' | 'minMargin'>): Record<number, string> {
  const fsUp = (1 + c.fsRate).toFixed(2);
  return {
    [ACM_COL.margin]:
      'Shows: how much of the full Budget is left after the media spent so far, the FS fee and the Nova fee.\n' +
      'Formula: (Budget − media spent − FS fee − Nova fee) ÷ Budget\n' +
      'When to use: a quick look only. It starts high and falls as the campaign spends. Use Projected Margin % for decisions.',
    [ACM_COL.projMargin]:
      "Shows: the margin when the campaign finishes, if the rest is bought at today's CTR and CPM.\n" +
      `Formula: (Budget − projected media × ${fsUp} − Nova fee) ÷ Budget\n` +
      `When to use: the main number for decisions. Below ${shortPct(c.minMargin)} → Margin Issue tab.`,
    [ACM_COL.ioMargin]:
      "Shows: this IO's own margin on what it has delivered so far.\n" +
      `Formula: (clicks × A$${c.clientCpc.toFixed(2)} − media × ${fsUp} − impressions ÷ 1000 × A$${c.novaCpm.toFixed(2)}) ÷ (clicks × A$${c.clientCpc.toFixed(2)})\n` +
      'When to use: to find which IO is losing money, then pause it or move budget.',
    [ACM_COL.overallMargin]:
      "Shows: the same as IO Margin %, for all the campaign's IOs together (on its first row).\n" +
      'Formula: the same as IO Margin %, added up over every IO\n' +
      "When to use: to check whether today's delivery is profitable overall.",
  };
}

const L = ACM_LETTER;

/**
 * Campaign Health for row x. `tgt` is the campaign's Total Clicks (main IO, no buffer) and `ach` all its IOs' clicks,
 * so every IO of a campaign shows the campaign's pace and the clicks still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: AcmConfig): string {
  const s = `${L.start}${x}`;
  const e = `${L.end}${x}`;
  const pace = `((TODAY()-${s}+1)/(${e}-${s}+1))`;
  const perDay = `ROUND((${tgt}-${ach})/MAX(1,${e}-TODAY()),0)&"/day"`;
  return (
    `=IFERROR(IF(OR(${tgt}="",${s}="",${e}=""),"",IF(${ach}>=${tgt},"🟢 Completed",IF(TODAY()<${s},"Not Started",IF(TODAY()>${e},"Ended",` +
    `IF((${ach}/${tgt})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay}))))))),"")`
  );
}

/** `h` is the sheet row of the campaign's first IO (it holds the campaign's Total Clicks and Budget). */
function rowCells(r: AcmRow, x: number, h: number, c: AcmConfig): SheetCell[] {
  const at = (k: AcmColumn) => `${L[k]}${x}`;
  const wrap = (f: string) => (r.isChild ? iferror(f) : f);
  const sumIf = (k: AcmColumn) => `SUMIF($${L.groupKey}$2:$${L.groupKey},$${L.groupKey}${x},$${L[k]}$2:$${L[k]})`;
  const fsUp = `(1+${c.fsRate})`;
  const budget = at('budget');
  const noBudget = `OR(${budget}="",${budget}=0)`;
  // Still needed and Health count from the campaign's Total Clicks (main IO, no buffer), minus every IO's clicks.
  const tgt = `$${L.total}$${h}`;
  const ach = sumIf('achieved');
  // A 2nd/3rd IO's own Total: main Total − the clicks of every IO above it (rows h … x−1).
  const ownTotal = r.isChild && !r.isHead ? `=IF(${tgt}="","",MAX(${tgt}-SUM($${L.achieved}$${h}:${L.achieved}${x - 1}),0))` : r.totalClicks;
  const total = at('total');
  const revenue = (clicks: string) => `${clicks}*${c.clientCpc}`;
  const margin = (clicks: string, media: string, impressions: string) =>
    `=IFERROR((${revenue(clicks)}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${revenue(clicks)}),"")`;

  const v: Record<AcmColumn, string | number | null> = {
    name: r.name,
    start: r.start,
    end: r.end,
    total: ownTotal,
    targeted: r.isHead && r.isChild ? null : `=IF(${total}="","",ROUND(${total}+(${total}*${pct(c.clickBuffer)}),0))`,
    achieved: r.achievedClicks,
    // What the campaign still needs, shown once, on its last IO.
    required: r.isLatest ? iferror(`=IF(${tgt}="","",MAX(${tgt}-${ach},0))`) : null,
    ctr: wrap(`=IF(OR(${at('achieved')}="",${at('impressions')}="",${at('impressions')}=0),"",${at('achieved')}/${at('impressions')})`),
    impressions: r.impressions,
    imprNeeded: r.isLatest ? wrap(`=IF(OR(${at('required')}="",${at('ctr')}="",${at('ctr')}=0),"",ROUND(${at('required')}/${at('ctr')},0))`) : null,
    imprTotal: r.isLatest ? wrap(`=IF(OR(${at('impressions')}="",${at('imprNeeded')}=""),"",${at('impressions')}+${at('imprNeeded')})`) : null,
    health: healthFormula(x, tgt, ach, c),
    days: wrap(`=MAX(0,ROUNDUP(${at('end')}-TODAY(),0))`),
    margin: r.isHead ? `=IF(${at('netProfit')}="","",${at('netProfit')}/${budget})` : null,
    projMargin: r.isHead ? `=IF(${at('projNet')}="","",${at('projNet')}/${budget})` : null,
    // This IO's margin on the clicks it has delivered; Overall: all IOs of the campaign together (first row).
    ioMargin: margin(at('achieved'), at('media'), at('impressions')),
    overallMargin: r.isHead ? margin(sumIf('achieved'), sumIf('media'), sumIf('impressions')) : null,
    media: r.mediaCost,
    fs: wrap(`=IF(${at('media')}="","",${at('media')}*${pct(c.fsRate)})`),
    // Nova: the latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    nova: r.isLatest
      ? wrap(`=IF(${at('imprTotal')}="","",(${at('imprTotal')}/1000)*${c.novaCpm})`)
      : `=IF(${at('impressions')}="","",(${at('impressions')}/1000)*${c.novaCpm})`,
    budget: r.isChild ? null : `=IF(${total}="","",${total}*${c.clientCpc})`,
    netProfit: r.isHead ? `=IF(${noBudget},"",${budget}-${sumIf('media')}-${sumIf('fs')}-${sumIf('nova')})` : null,
    projMedia: r.isLatest
      ? `=IFERROR(IF(${at('impressions')}>0,${at('media')}/${at('impressions')}*${at('imprTotal')},${at('media')}),${at('media')})`
      : `=${at('media')}`,
    projNet: r.isHead ? `=IF(${noBudget},"",${budget}-${sumIf('projMedia')}*${fsUp}-${sumIf('nova')})` : null,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return ACM_COLUMNS.map(([k]) => ({ value: v[k] }));
}

/** Calculated values for the Urgent / Margin Issue tabs (A … Comment), in the Report's column order. */
export function acmRowValues(r: AcmRow): (number | string | null)[] {
  const v: Record<AcmColumn, number | string | null> = {
    name: r.name,
    start: r.start,
    end: r.end,
    total: r.totalClicks,
    targeted: r.targetedClicks,
    achieved: r.achievedClicks,
    required: r.requiredClicks,
    ctr: r.ctr,
    impressions: r.impressions,
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
    budget: r.budget,
    netProfit: r.netProfit,
    projMedia: r.projectedMediaCost,
    projNet: r.projectedNetProfit,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return ACM_COLUMNS.slice(0, ACM_DATA_COLUMNS).map(([k]) => v[k]);
}

export function buildAcmSheetSpec(result: AcmResult, config: AcmConfig, title = 'Report'): SheetSpec {
  let head = 2;
  return {
    title,
    headers: ACM_HEADERS,
    rows: result.rows.map((r, i) => {
      if (r.isHead) head = i + 2;
      return rowCells(r, i + 2, head, config);
    }),
    hiddenColumns: [GROUP_KEY_COLUMN],
    headerNotes: { [ACM_REQUIRED_COLUMN]: requiredNote(config), ...marginNotes(config) },
  };
}
