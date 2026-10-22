import type { SheetCell, SheetSpec } from '../types';
import type { PinstripeConfig } from './config';
import type { PinstripeResult, PinstripeRow } from './rules';

/**
 * The Pinstripe Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Pinstripe config.
 *
 * Column order (Oct 2026): delivery, then Health and days left, then the four margins side by side,
 * then costs and budget, Comment last. Every formula takes its letters from PINSTRIPE_COLUMNS, so the order lives here only.
 */
export const PINSTRIPE_COLUMNS = [
  ['name', 'Campaign name'],
  ['type', 'Type'],
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

export type PinstripeColumn = (typeof PINSTRIPE_COLUMNS)[number][0];

const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** 0-based index of each column. */
export const PINSTRIPE_COL = Object.fromEntries(PINSTRIPE_COLUMNS.map(([k], i) => [k, i])) as Record<PinstripeColumn, number>;
/** Letter of each column, e.g. PINSTRIPE_LETTER.media = "T". */
export const PINSTRIPE_LETTER = Object.fromEntries(PINSTRIPE_COLUMNS.map(([k], i) => [k, letter(i)])) as Record<PinstripeColumn, string>;

export const PINSTRIPE_HEADERS = PINSTRIPE_COLUMNS.map(([, h]) => h);
/** Data columns written on every tab (A … Comment). */
export const PINSTRIPE_DATA_COLUMNS = PINSTRIPE_COL.comment + 1;
/** Column of the group key (1-based); it is hidden. */
export const PINSTRIPE_GROUP_KEY_COLUMN = PINSTRIPE_COL.groupKey + 1;
/** What the campaign still needs. */
export const PINSTRIPE_REQUIRED_COLUMN = PINSTRIPE_COL.required;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const shortPct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

/** Hover note on the Required header, so anyone reading the sheet knows the extra is left out. */
export const requiredNote = (c: Pick<PinstripeConfig, 'targetBuffer'>) =>
  `Still needed = Total target − every IO's Achieved (clicks, or impressions for impression campaigns). Does not include the ${pct(c.targetBuffer)} extra in Targeted. Shown on the campaign's last IO.`;

/** Hover notes on the four margin headers: what each shows, its formula, and when to look at it. */
export function marginNotes(c: Pick<PinstripeConfig, 'clientCpc' | 'fsRate' | 'novaCpm' | 'minMargin'>): Record<number, string> {
  const fsUp = (1 + c.fsRate).toFixed(2);
  const revenue = `revenue (clicks × A$${c.clientCpc.toFixed(2)}; impression campaigns: impressions × Budget ÷ impression target)`;
  return {
    [PINSTRIPE_COL.margin]:
      'Shows: how much of the full Budget is left after the media spent so far, the FS fee and the Nova fee.\n' +
      'Formula: (Budget − media spent − FS fee − Nova fee) ÷ Budget\n' +
      'When to use: a quick look only. It starts high and falls as the campaign spends. Use Projected Margin % for decisions.',
    [PINSTRIPE_COL.projMargin]:
      "Shows: the margin when the campaign finishes, if the rest is bought at today's CTR and CPM.\n" +
      `Formula: (Budget − projected media × ${fsUp} − Nova fee) ÷ Budget\n` +
      `When to use: the main number for decisions. Below ${shortPct(c.minMargin)} → Margin Issue tab.`,
    [PINSTRIPE_COL.ioMargin]:
      "Shows: this IO's own margin on what it has delivered so far.\n" +
      `Formula: (${revenue} − media × ${fsUp} − impressions ÷ 1000 × A$${c.novaCpm.toFixed(2)}) ÷ revenue\n` +
      'When to use: to find which IO is losing money, then pause it or move budget.',
    [PINSTRIPE_COL.overallMargin]:
      "Shows: the same as IO Margin %, for all the campaign's IOs together (on its first row).\n" +
      'Formula: the same as IO Margin %, added up over every IO\n' +
      "When to use: to check whether today's delivery is profitable overall.",
  };
}

const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;
const L = PINSTRIPE_LETTER;

/**
 * Campaign Health for row x. `tgt` is the campaign's Total target (main IO, no buffer) and `ach` all its IOs' delivery,
 * so every IO of a campaign shows the campaign's pace and what is still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: PinstripeConfig): string {
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

function budgetCell(r: PinstripeRow, x: number, c: PinstripeConfig): string | number | null {
  if (r.isChild) return null;
  // Click campaigns: Click Target × CPC. Impression campaigns: the budget typed into the tracker.
  return r.type === 'Clicks' ? `=IF(${L.total}${x}="","",${L.total}${x}*${c.clientCpc})` : r.budget;
}

/** `h` is the sheet row of the campaign's first IO (it holds the target and budget). */
function rowCells(r: PinstripeRow, x: number, h: number, c: PinstripeConfig): SheetCell[] {
  const at = (k: PinstripeColumn) => `${L[k]}${x}`;
  const sumIf = (k: PinstripeColumn) => `SUMIF($${L.groupKey}$2:$${L.groupKey},$${L.groupKey}${x},$${L[k]}$2:$${L[k]})`;
  const fsUp = `(1+${c.fsRate})`;
  const budget = at('budget');
  // Revenue: clicks × CPC, or impressions at the campaign's budget rate (budget ÷ impression target, on the first IO).
  const revenue = (clicks: string, impressions: string) =>
    `IF($${L.type}${x}="Impressions",${impressions}*$${L.budget}$${h}/$${L.total}$${h},${clicks}*${c.clientCpc})`;
  const margin = (rev: string, media: string, impressions: string) => `=IFERROR((${rev}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${rev}),"")`;
  const noBudget = `OR(${budget}="",${budget}=0)`;
  // Still needed and Health count from the Total target (no buffer), minus every IO's delivery.
  const tgt = `$${L.total}$${h}`;
  const ach = sumIf('achieved');
  const total = at('total');

  const v: Record<PinstripeColumn, string | number | null> = {
    name: r.name,
    type: r.type,
    start: r.start,
    end: r.end,
    // A 2nd/3rd IO's own Total: main Total − the delivery of every IO above it (rows h … x−1).
    total: r.isChild && !r.isHead ? `=IF(${tgt}="","",MAX(${tgt}-SUM($${L.achieved}$${h}:${L.achieved}${x - 1}),0))` : r.totalTarget,
    targeted: r.isHead && r.isChild ? null : `=IF(${total}="","",ROUND(${total}+(${total}*${pct(c.targetBuffer)}),0))`,
    achieved: `=IF($${L.type}${x}="Impressions",${at('impressions')},${at('clicks')})`,
    required: r.isLatest ? iferror(`=IF(${tgt}="","",MAX(${tgt}-${ach},0))`) : null, // still needed, on the last IO only
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: iferror(`=IF(OR(${at('clicks')}="",${at('impressions')}="",${at('impressions')}=0),"",${at('clicks')}/${at('impressions')})`),
    imprNeeded: r.isLatest
      ? iferror(`=IF(${at('required')}="","",IF($${L.type}${x}="Impressions",${at('required')},IF(OR(${at('ctr')}="",${at('ctr')}=0),"",ROUND(${at('required')}/${at('ctr')},0))))`)
      : null,
    imprTotal: r.isLatest ? iferror(`=IF(OR(${at('impressions')}="",${at('imprNeeded')}=""),"",${at('impressions')}+${at('imprNeeded')})`) : null,
    health: iferror(healthFormula(x, tgt, ach, c)),
    days: iferror(`=MAX(0,ROUNDUP(${at('end')}-TODAY(),0))`),
    margin: r.isHead ? `=IF(${at('netProfit')}="","",${at('netProfit')}/${budget})` : null,
    projMargin: r.isHead ? `=IF(${at('projNet')}="","",${at('projNet')}/${budget})` : null,
    ioMargin: margin(revenue(at('clicks'), at('impressions')), at('media'), at('impressions')),
    overallMargin: r.isHead ? margin(revenue(sumIf('clicks'), sumIf('impressions')), sumIf('media'), sumIf('impressions')) : null,
    media: r.mediaCost,
    fs: iferror(`=IF(${at('media')}="","",${at('media')}*${pct(c.fsRate)})`),
    // The latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    nova: r.isLatest
      ? iferror(`=IF(${at('imprTotal')}="","",(${at('imprTotal')}/1000)*${c.novaCpm})`)
      : `=IF(${at('impressions')}="","",(${at('impressions')}/1000)*${c.novaCpm})`,
    budget: budgetCell(r, x, c),
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
  return PINSTRIPE_COLUMNS.map(([k]) => ({ value: v[k] }));
}

/** Calculated values for the Urgent / Margin Issue tabs (A … Comment), in the Report's column order. */
export function pinstripeRowValues(r: PinstripeRow): (number | string | null)[] {
  const v: Record<PinstripeColumn, number | string | null> = {
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
    budget: r.budget,
    netProfit: r.netProfit,
    projMedia: r.projectedMediaCost,
    projNet: r.projectedNetProfit,
    comment: r.comment || null,
    gap: null,
    updated: null,
    groupKey: r.groupKey,
  };
  return PINSTRIPE_COLUMNS.slice(0, PINSTRIPE_DATA_COLUMNS).map(([k]) => v[k]);
}

export function buildPinstripeSheetSpec(result: PinstripeResult, config: PinstripeConfig, title = 'Report'): SheetSpec {
  return {
    title,
    headers: PINSTRIPE_HEADERS,
    rows: (() => {
      let head = 2;
      return result.rows.map((r, i) => {
        if (r.isHead) head = i + 2;
        return rowCells(r, i + 2, head, config);
      });
    })(),
    hiddenColumns: [PINSTRIPE_GROUP_KEY_COLUMN],
    headerNotes: { [PINSTRIPE_REQUIRED_COLUMN]: requiredNote(config), ...marginNotes(config) },
  };
}
