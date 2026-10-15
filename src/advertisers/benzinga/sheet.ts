import type { SheetCell, SheetSpec } from '../types';
import type { BenzingaConfig } from './config';
import type { BenzingaResult, BenzingaRow } from './rules';

/**
 * The Benzinga Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Benzinga config.
 *
 * A Campaign name · B Buying Type · C Start · D End · E Total target · F Targeted · G Achieved
 * H Required (without extra) · I Clicks · J Impressions · K CTR · L Impressions needed · M Required total impressions
 * N Inventory cost (AUD) · O DV360/FS platform fee (AUD) · P Nova fee (AUD) · Q Budget (USD) · R USD → AUD rate
 * S Budget (AUD) · T Net profit (AUD) · U Net profit (USD) · V Margin % · W Campaign Health · X Remaining days
 * Y Comment · Z–AB Projected · AC IO Margin % · AD Overall Margin % · AF Last Updated · AG Group Key (hidden)
 */
export const BENZINGA_HEADERS = [
  'Campaign name', 'Buying Type', 'Start date', 'End date', 'Total target', 'Targeted', 'Achieved', 'Required (without extra)',
  'Clicks', 'Impressions spent', 'Actual Average CTR', 'Impressions needed', 'Required Total Impression',
  'Inventory cost (AUD)', 'DV360/FS platform fee (AUD)', 'Nova fee (AUD)', 'Budget (USD)', 'USD → AUD rate', 'Budget (AUD)',
  'Net profit (AUD)', 'Net profit (USD)', 'Margin %', 'Campaign Health', 'Remaining Days', 'Comment',
  'Projected Media Cost (AUD)', 'Projected Net Profit (AUD)', 'Projected Margin %', 'IO Margin %', 'Overall Margin %',
  '', 'Last Updated:', 'Group Key',
] as const;

/** Number of data columns (A–AD). */
export const BENZINGA_DATA_COLUMNS = 30;
/** Column AG (33rd) holds the group key and is hidden. */
export const BENZINGA_GROUP_KEY_COLUMN = 33;
/** 0-based columns that carry a hover note on their header. */
export const BENZINGA_REQUIRED_COLUMN = 7;
export const BENZINGA_FEE_COLUMN = 14;
export const BENZINGA_RATE_COLUMN = 17;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

export function headerNotes(c: Pick<BenzingaConfig, 'targetBuffer' | 'fsRate'>): Record<number, string> {
  return {
    [BENZINGA_REQUIRED_COLUMN]: `Still needed = Total target − every IO's Achieved (clicks for CPC, impressions for CPM). Does not include the ${pct(c.targetBuffer)} extra in Targeted. Shown on the campaign's last IO. Blank for CPCV: views are not in the DV360 CSV.`,
    [BENZINGA_FEE_COLUMN]: `${+(c.fsRate * 100).toFixed(4)}% of inventory cost (4.5% ÷ 1.1), as in the Campaign Tracker.`,
    [BENZINGA_RATE_COLUMN]: 'A$ per US$1, from the Campaign Tracker. A campaign split by month uses its rows together: Budget (AUD) = each row\'s US$ × its own rate.',
  };
}

/**
 * Campaign Health for row x. `tgt` is the campaign's Total target (first IO, no buffer) and `ach` all its IOs' delivery,
 * so every IO of a campaign shows the campaign's pace and what is still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: BenzingaConfig): string {
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

/** `h` is the sheet row of the campaign's first IO (it holds the target, budget and rate). */
function rowCells(r: BenzingaRow, x: number, h: number, c: BenzingaConfig): SheetCell[] {
  const sumIf = (col: string) => `SUMIF($AG$2:$AG,$AG${x},$${col}$2:$${col})`;
  const fsUp = `(1+${c.fsRate})`;
  // Revenue in A$: CPC = clicks × US$ CPC × rate; CPM = impressions at the campaign's A$ rate (Budget (AUD) ÷ target).
  const revenue = (clicks: string, impressions: string) =>
    `IF($B${x}="CPM",${impressions}*$S$${h}/$E$${h},IF($B${x}="CPC",${clicks}*${c.clientCpcUsd}*$R$${h},""))`;
  const margin = (rev: string, media: string, impressions: string) => `=IFERROR((${rev}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${rev}),"")`;
  const noBudget = `OR(S${x}="",S${x}=0)`;
  // Still needed and Health count from the Total target (no buffer), minus every IO's delivery.
  const tgt = `$E$${h}`;
  const ach = sumIf('G');

  const budgetUsd = !r.isHead ? null : r.type === 'CPC' && r.totalTarget != null ? `=IF(E${x}="","",E${x}*${c.clientCpcUsd})` : r.budgetUsd;

  const cells: (string | number | null)[] = [
    r.name, // A
    r.type, // B
    r.start, // C
    r.end, // D
    r.totalTarget, // E
    r.isHead ? `=IF(E${x}="","",ROUND(E${x}+(E${x}*${pct(c.targetBuffer)}),0))` : null, // F
    `=IF($B${x}="CPM",J${x},IF($B${x}="CPC",I${x},""))`, // G
    r.isLatest ? iferror(`=IF(OR($B${x}="CPCV",${tgt}=""),"",MAX(${tgt}-${ach},0))`) : null, // H: still needed, last IO only
    r.clicks, // I
    r.impressions, // J
    iferror(`=IF(OR(I${x}="",J${x}="",J${x}=0),"",I${x}/J${x})`), // K
    r.isLatest ? iferror(`=IF(H${x}="","",IF($B${x}="CPM",H${x},IF(OR(K${x}="",K${x}=0),"",ROUND(H${x}/K${x},0))))`) : null, // L
    r.isLatest ? iferror(`=IF(OR(J${x}="",L${x}=""),"",J${x}+L${x})`) : null, // M
    r.mediaCost, // N
    `=N${x}*${pct(c.fsRate)}`, // O
    // P: the latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    r.isLatest ? `=(IF(M${x}="",J${x},M${x})/1000)*${c.novaCpm}` : `=(J${x}/1000)*${c.novaCpm}`, // P
    budgetUsd, // Q
    r.isHead ? r.fx : null, // R
    r.isHead ? `=IF(OR(Q${x}="",R${x}=""),"",Q${x}*R${x})` : null, // S
    r.isHead ? `=IF(${noBudget},"",S${x}-${sumIf('N')}-${sumIf('O')}-${sumIf('P')})` : null, // T
    r.isHead ? `=IF(OR(T${x}="",R${x}="",R${x}=0),"",T${x}/R${x})` : null, // U
    r.isHead ? `=IF(T${x}="","",T${x}/S${x})` : null, // V
    r.type === 'CPCV' ? null : iferror(healthFormula(x, tgt, ach, c)), // W
    r.end == null ? null : `=MAX(0,ROUNDUP(D${x}-TODAY(),0))`, // X
    r.comment || null, // Y
    r.isLatest ? `=IFERROR(IF(J${x}>0,N${x}/J${x}*M${x},N${x}),N${x})` : `=N${x}`, // Z
    r.isHead ? `=IF(${noBudget},"",S${x}-${sumIf('Z')}*${fsUp}-${sumIf('P')})` : null, // AA
    r.isHead ? `=IF(AA${x}="","",AA${x}/S${x})` : null, // AB
    margin(revenue(`I${x}`, `J${x}`), `N${x}`, `J${x}`), // AC
    r.isHead ? margin(revenue(sumIf('I'), sumIf('J')), sumIf('N'), sumIf('J')) : null, // AD
    null, // AE
    null, // AF
    r.groupKey, // AG
  ];
  return cells.map((value) => ({ value }));
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
