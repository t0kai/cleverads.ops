import type { SheetCell, SheetSpec } from '../types';
import type { BenzingaConfig } from './config';
import type { BenzingaResult, BenzingaRow } from './rules';

/**
 * The Benzinga Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Benzinga config.
 *
 * Column order (Oct 2026): delivery, then Health and days left, then the four margins side by side,
 * then costs, US$/A$ budget and profit, Comment last. Every formula takes its letters from BENZINGA_COLUMNS.
 */
export const BENZINGA_COLUMNS = [
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

export type BenzingaColumn = (typeof BENZINGA_COLUMNS)[number][0];

const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** 0-based index of each column. */
export const BENZINGA_COL = Object.fromEntries(BENZINGA_COLUMNS.map(([k], i) => [k, i])) as Record<BenzingaColumn, number>;
/** Letter of each column, e.g. BENZINGA_LETTER.media = "T". */
export const BENZINGA_LETTER = Object.fromEntries(BENZINGA_COLUMNS.map(([k], i) => [k, letter(i)])) as Record<BenzingaColumn, string>;

export const BENZINGA_HEADERS = BENZINGA_COLUMNS.map(([, h]) => h);
/** Data columns written on every tab (A … Comment). */
export const BENZINGA_DATA_COLUMNS = BENZINGA_COL.comment + 1;
/** Column of the group key (1-based); it is hidden. */
export const BENZINGA_GROUP_KEY_COLUMN = BENZINGA_COL.groupKey + 1;
/** 0-based columns that carry a hover note on their header. */
export const BENZINGA_REQUIRED_COLUMN = BENZINGA_COL.required;
export const BENZINGA_FEE_COLUMN = BENZINGA_COL.fs;
export const BENZINGA_RATE_COLUMN = BENZINGA_COL.fx;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const shortPct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;
const L = BENZINGA_LETTER;

export function headerNotes(c: Pick<BenzingaConfig, 'targetBuffer' | 'fsRate' | 'clientCpcUsd' | 'novaCpm' | 'minMargin'>): Record<number, string> {
  const fsUp = (1 + c.fsRate).toFixed(4);
  const revenue = `revenue in A$ (CPC: clicks × US$${c.clientCpcUsd.toFixed(2)} × USD → AUD rate; CPM: impressions × Budget (AUD) ÷ impression target)`;
  return {
    [BENZINGA_REQUIRED_COLUMN]: `Still needed = Total target − every IO's Achieved (clicks for CPC, impressions for CPM). Does not include the ${pct(c.targetBuffer)} extra in Targeted. Shown on the campaign's last IO. Blank for CPCV: views are not in the DV360 CSV.`,
    [BENZINGA_FEE_COLUMN]: `${+(c.fsRate * 100).toFixed(4)}% of inventory cost (4.5% ÷ 1.1), as in the Campaign Tracker.`,
    [BENZINGA_RATE_COLUMN]: 'A$ per US$1, from the Campaign Tracker. A campaign split by month uses its rows together: Budget (AUD) = each row\'s US$ × its own rate.',
    [BENZINGA_COL.margin]:
      'Shows: how much of the full Budget (AUD) is left after the media spent so far, the platform fee and the Nova fee.\n' +
      'Formula: (Budget (AUD) − media spent − platform fee − Nova fee) ÷ Budget (AUD)\n' +
      'When to use: a quick look only. It starts high and falls as the campaign spends. Use Projected Margin % for decisions.',
    [BENZINGA_COL.projMargin]:
      "Shows: the margin when the campaign finishes, if the rest is bought at today's CTR and CPM.\n" +
      `Formula: (Budget (AUD) − projected media × ${fsUp} − Nova fee) ÷ Budget (AUD)\n` +
      `When to use: the main number for decisions. Below ${shortPct(c.minMargin)} → Margin Issue tab.`,
    [BENZINGA_COL.ioMargin]:
      "Shows: this IO's own margin on what it has delivered so far. Blank for CPCV (views are not in the CSV).\n" +
      `Formula: (${revenue} − media × ${fsUp} − impressions ÷ 1000 × A$${c.novaCpm.toFixed(2)}) ÷ revenue\n` +
      'When to use: to find which IO is losing money, then pause it or move budget.',
    [BENZINGA_COL.overallMargin]:
      "Shows: the same as IO Margin %, for all the campaign's IOs together (on its first row).\n" +
      'Formula: the same as IO Margin %, added up over every IO\n' +
      "When to use: to check whether today's delivery is profitable overall.",
  };
}

/**
 * Campaign Health for row x. `tgt` is the campaign's Total target (first IO, no buffer) and `ach` all its IOs' delivery,
 * so every IO of a campaign shows the campaign's pace and what is still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: BenzingaConfig): string {
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

/** `h` is the sheet row of the campaign's first IO (it holds the target, budget and rate). */
function rowCells(r: BenzingaRow, x: number, h: number, c: BenzingaConfig): SheetCell[] {
  const at = (k: BenzingaColumn) => `${L[k]}${x}`;
  const sumIf = (k: BenzingaColumn) => `SUMIF($${L.groupKey}$2:$${L.groupKey},$${L.groupKey}${x},$${L[k]}$2:$${L[k]})`;
  const fsUp = `(1+${c.fsRate})`;
  const type = `$${L.type}${x}`;
  // Revenue in A$: CPC = clicks × US$ CPC × rate; CPM = impressions at the campaign's A$ rate (Budget (AUD) ÷ target).
  const revenue = (clicks: string, impressions: string) =>
    `IF(${type}="CPM",${impressions}*$${L.budgetAud}$${h}/$${L.total}$${h},IF(${type}="CPC",${clicks}*${c.clientCpcUsd}*$${L.fx}$${h},""))`;
  const margin = (rev: string, media: string, impressions: string) => `=IFERROR((${rev}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${rev}),"")`;
  const aud = at('budgetAud');
  const noBudget = `OR(${aud}="",${aud}=0)`;
  // Still needed and Health count from the Total target (no buffer), minus every IO's delivery.
  const tgt = `$${L.total}$${h}`;
  const ach = sumIf('achieved');
  const total = at('total');

  const v: Record<BenzingaColumn, string | number | null> = {
    name: r.name,
    type: r.type,
    start: r.start,
    end: r.end,
    // A follow-on IO's own Total: Total − the delivery of every IO above it (rows h … x−1). CPCV: no delivery to count.
    total: r.isHead ? r.totalTarget : r.type === 'CPCV' ? null : `=IF(${tgt}="","",MAX(${tgt}-SUM($${L.achieved}$${h}:${L.achieved}${x - 1}),0))`,
    targeted: `=IF(${total}="","",ROUND(${total}+(${total}*${pct(c.targetBuffer)}),0))`,
    achieved: `=IF(${type}="CPM",${at('impressions')},IF(${type}="CPC",${at('clicks')},""))`,
    required: r.isLatest ? iferror(`=IF(OR(${type}="CPCV",${tgt}=""),"",MAX(${tgt}-${ach},0))`) : null, // still needed, last IO only
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: iferror(`=IF(OR(${at('clicks')}="",${at('impressions')}="",${at('impressions')}=0),"",${at('clicks')}/${at('impressions')})`),
    imprNeeded: r.isLatest
      ? iferror(`=IF(${at('required')}="","",IF(${type}="CPM",${at('required')},IF(OR(${at('ctr')}="",${at('ctr')}=0),"",ROUND(${at('required')}/${at('ctr')},0))))`)
      : null,
    imprTotal: r.isLatest ? iferror(`=IF(OR(${at('impressions')}="",${at('imprNeeded')}=""),"",${at('impressions')}+${at('imprNeeded')})`) : null,
    health: r.type === 'CPCV' ? null : iferror(healthFormula(x, tgt, ach, c)),
    days: r.end == null ? null : `=MAX(0,ROUNDUP(${at('end')}-TODAY(),0))`,
    margin: r.isHead ? `=IF(${at('netAud')}="","",${at('netAud')}/${aud})` : null,
    projMargin: r.isHead ? `=IF(${at('projNet')}="","",${at('projNet')}/${aud})` : null,
    ioMargin: margin(revenue(at('clicks'), at('impressions')), at('media'), at('impressions')),
    overallMargin: r.isHead ? margin(revenue(sumIf('clicks'), sumIf('impressions')), sumIf('media'), sumIf('impressions')) : null,
    media: r.mediaCost,
    fs: `=${at('media')}*${pct(c.fsRate)}`,
    // The latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    nova: r.isLatest
      ? `=(IF(${at('imprTotal')}="",${at('impressions')},${at('imprTotal')})/1000)*${c.novaCpm}`
      : `=(${at('impressions')}/1000)*${c.novaCpm}`,
    budgetUsd: !r.isHead ? null : r.type === 'CPC' && r.totalTarget != null ? `=IF(${total}="","",${total}*${c.clientCpcUsd})` : r.budgetUsd,
    fx: r.isHead ? r.fx : null,
    budgetAud: r.isHead ? `=IF(OR(${at('budgetUsd')}="",${at('fx')}=""),"",${at('budgetUsd')}*${at('fx')})` : null,
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
  return BENZINGA_COLUMNS.map(([k]) => ({ value: v[k] }));
}

/** Calculated values for the Urgent / Margin Issue tabs (A … Comment), in the Report's column order. */
export function benzingaRowValues(r: BenzingaRow): (number | string | null)[] {
  const v: Record<BenzingaColumn, number | string | null> = {
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
  return BENZINGA_COLUMNS.slice(0, BENZINGA_DATA_COLUMNS).map(([k]) => v[k]);
}

export function buildBenzingaSheetSpec(result: BenzingaResult, config: BenzingaConfig, title = 'Report'): SheetSpec {
  let head = 2;
  return {
    title,
    headers: BENZINGA_HEADERS,
    rows: result.rows.map((r, i) => {
      if (r.isHead) head = i + 2;
      return rowCells(r, i + 2, head, config);
    }),
    hiddenColumns: [BENZINGA_GROUP_KEY_COLUMN],
    headerNotes: headerNotes(config),
  };
}
