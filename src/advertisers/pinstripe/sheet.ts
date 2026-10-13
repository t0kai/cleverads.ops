import type { SheetCell, SheetSpec } from '../types';
import type { PinstripeConfig } from './config';
import type { PinstripeResult, PinstripeRow } from './rules';

/**
 * The Pinstripe Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Pinstripe config.
 *
 * A Campaign name · B Type · C Start · D End · E Total target · F Targeted · G Achieved · H Required
 * I Clicks · J Impressions · K CTR · L Impressions needed · M Required total impressions
 * N Inventory cost · O FS fee · P Nova fee · Q Budget · R Net profit · S Margin %
 * T Campaign Health · U Remaining days · V Comment · W–Y Projected · Z IO Margin % · AA Overall Margin %
 * AC Last Updated · AD Group Key (hidden)
 */
export const PINSTRIPE_HEADERS = [
  'Campaign name', 'Type', 'Start date', 'End date', 'Total target', 'Targeted', 'Achieved', 'Required',
  'Clicks', 'Impressions spent', 'Actual Average CTR', 'Impressions needed', 'Required Total Impression',
  'Inventory cost', 'FS Service fee', 'Nova fee', 'Budget', 'Net profit', 'Margin %', 'Campaign Health',
  'Remaining Days', 'Comment', 'Projected Media Cost', 'Projected Net Profit', 'Projected Margin %', 'IO Margin %',
  'Overall Margin %', '', 'Last Updated:', 'Group Key',
] as const;

/** Number of data columns (A–AA). */
export const PINSTRIPE_DATA_COLUMNS = 27;
/** Column AD (30th) holds the group key and is hidden. */
export const PINSTRIPE_GROUP_KEY_COLUMN = 30;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

/**
 * Campaign Health for row x. `tgt` is the campaign's Total target (main IO, no buffer) and `ach` all its IOs' delivery,
 * so every IO of a campaign shows the campaign's pace and what is still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: PinstripeConfig): string {
  const pace = `((TODAY()-C${x}+1)/(D${x}-C${x}+1))`;
  const perDay = `ROUND((${tgt}-${ach})/MAX(1,D${x}-TODAY()),0)&"/day"`;
  return (
    `=IF(OR(${tgt}="",C${x}="",D${x}=""),"",IF(${ach}>=${tgt},"🟢 Completed",IF(TODAY()<C${x},"Not Started",IF(TODAY()>D${x},"Ended",` +
    `IF((${ach}/${tgt})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay})))))))`
  );
}

function budgetCell(r: PinstripeRow, x: number, c: PinstripeConfig): string | number | null {
  if (r.isChild) return null;
  // Click campaigns: Click Target × CPC. Impression campaigns: the budget typed into the tracker.
  return r.type === 'Clicks' ? `=IF(E${x}="","",E${x}*${c.clientCpc})` : r.budget;
}

/** `h` is the sheet row of the campaign's first IO (it holds the target and budget). */
function rowCells(r: PinstripeRow, x: number, h: number, c: PinstripeConfig): SheetCell[] {
  const sumIf = (col: string) => `SUMIF($AD$2:$AD,$AD${x},$${col}$2:$${col})`;
  const fsUp = `(1+${c.fsRate})`;
  // Revenue: clicks × CPC, or impressions at the campaign's budget rate (budget ÷ impression target, on the first IO).
  const revenue = (clicks: string, impressions: string) => `IF($B${x}="Impressions",${impressions}*$Q$${h}/$E$${h},${clicks}*${c.clientCpc})`;
  const margin = (rev: string, media: string, impressions: string) => `=IFERROR((${rev}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${rev}),"")`;
  const noBudget = `OR(Q${x}="",Q${x}=0)`;

  // One target per campaign, on the main IO. Every IO's delivery (column G) counts towards it.
  const F = r.isChild ? null : `=IF(E${x}="","",ROUND(E${x}+(E${x}*${pct(c.targetBuffer)}),0))`;
  // Still needed and Health count from the Total target (no buffer), minus every IO's delivery.
  const tgt = `$E$${h}`;
  const ach = sumIf('G');

  const cells: (string | number | null)[] = [
    r.name, // A
    r.type, // B
    r.start, // C
    r.end, // D
    r.totalTarget, // E
    F, // F
    `=IF($B${x}="Impressions",J${x},I${x})`, // G
    r.isLatest ? iferror(`=IF(${tgt}="","",MAX(${tgt}-${ach},0))`) : null, // H: still needed, on the last IO only
    r.clicks, // I
    r.impressions, // J
    iferror(`=IF(OR(I${x}="",J${x}="",J${x}=0),"",I${x}/J${x})`), // K
    r.isLatest ? iferror(`=IF(H${x}="","",IF($B${x}="Impressions",H${x},IF(OR(K${x}="",K${x}=0),"",ROUND(H${x}/K${x},0))))`) : null, // L
    r.isLatest ? iferror(`=IF(OR(J${x}="",L${x}=""),"",J${x}+L${x})`) : null, // M
    r.mediaCost, // N
    iferror(`=IF(N${x}="","",N${x}*${pct(c.fsRate)})`), // O
    // P: the latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    r.isLatest ? iferror(`=IF(M${x}="","",(M${x}/1000)*${c.novaCpm})`) : `=IF(J${x}="","",(J${x}/1000)*${c.novaCpm})`, // P
    budgetCell(r, x, c), // Q
    r.isHead ? `=IF(${noBudget},"",Q${x}-${sumIf('N')}-${sumIf('O')}-${sumIf('P')})` : null, // R
    r.isHead ? `=IF(R${x}="","",R${x}/Q${x})` : null, // S
    iferror(healthFormula(x, tgt, ach, c)), // T
    iferror(`=MAX(0,ROUNDUP(D${x}-TODAY(),0))`), // U
    r.comment || null, // V
    r.isLatest ? `=IFERROR(IF(J${x}>0,N${x}/J${x}*M${x},N${x}),N${x})` : `=N${x}`, // W
    r.isHead ? `=IF(${noBudget},"",Q${x}-${sumIf('W')}*(1+${c.fsRate})-${sumIf('P')})` : null, // X
    r.isHead ? `=IF(X${x}="","",X${x}/Q${x})` : null, // Y
    margin(revenue(`I${x}`, `J${x}`), `N${x}`, `J${x}`), // Z
    r.isHead ? margin(revenue(sumIf('I'), sumIf('J')), sumIf('N'), sumIf('J')) : null, // AA
    null, // AB
    null, // AC
    r.groupKey, // AD
  ];
  return cells.map((value) => ({ value }));
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
  };
}
