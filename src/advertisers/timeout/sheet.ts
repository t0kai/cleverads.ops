import type { SheetCell, SheetSpec } from '../types';
import type { TimeOutConfig } from './config';
import type { TimeOutResult, TimeOutRow } from './rules';

/**
 * The Time Out Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Time Out config.
 * Every IO of a campaign stays live (main, 2nd, 3rd can all run); each gets its own margin.
 *
 * A Campaign name · B Campaign Type · C Start · D End · E Total Clicks · F Targeted · G Achieved · H Required
 * I CTR · J Impressions · K Impressions needed · L Required total impressions · M Inventory cost · N FS fee
 * O Nova fee · P Budget · Q Net profit · R Margin % · S Campaign Health (with clicks needed per day)
 * T Remaining Days · U Comment · V–X Projected · Y IO Margin % · Z Overall Margin %
 * AB Last Updated · AC Group Key (hidden)
 */
export const TIMEOUT_HEADERS = [
  'Campaign name', 'Campaign Type', 'Start date', 'End date', 'Total Clicks', 'Targeted Clicks', 'Achieved Clicks',
  'Required Clicks', 'Actual Average CTR', 'Impressions spent', 'Impression needed for required clicks',
  'Required Total Impression', 'Inventory cost', 'FS Service fee', 'Nova fee', 'Budget', 'Net profit', 'Margin %',
  'Campaign Health', 'Remaining Days', 'Comment', 'Projected Media Cost', 'Projected Net Profit', 'Projected Margin %',
  'IO Margin %', 'Overall Margin %', '', 'Last Updated:', 'Group Key',
] as const;

/** Number of data columns (A–Z). */
export const TIMEOUT_DATA_COLUMNS = 26;
/** Column AC (29th) holds the group key and is hidden. */
export const TIMEOUT_GROUP_KEY_COLUMN = 29;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

function healthFormula(x: number, c: TimeOutConfig): string {
  const pace = `((TODAY()-C${x}+1)/(D${x}-C${x}+1))`;
  const perDay = `ROUND((F${x}-G${x})/MAX(1,D${x}-TODAY()),0)&"/day"`;
  return (
    `=IF(OR(F${x}="",C${x}="",D${x}=""),"",IF(G${x}>=F${x},"🟢 Completed",IF(TODAY()<C${x},"Not Started",IF(TODAY()>D${x},"Ended",` +
    `IF((G${x}/F${x})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((G${x}/F${x})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((G${x}/F${x})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay})))))))`
  );
}

function rowCells(r: TimeOutRow, x: number, c: TimeOutConfig): SheetCell[] {
  const wrap = (f: string) => (r.isChild ? iferror(f) : f);
  const sumIf = (col: string) => `SUMIF($AC$2:$AC,$AC${x},$${col}$2:$${col})`;
  const noBudget = `OR(P${x}="",P${x}=0)`;
  const fsUp = `(1+${c.fsRate})`;
  const margin = (clicks: string, media: string, impressions: string) =>
    `=IFERROR((${clicks}*${c.clientCpc}-${media}*${fsUp}-(${impressions}/1000)*${c.novaCpm})/(${clicks}*${c.clientCpc}),"")`;

  const F = !r.isChild
    ? `=IF(E${x}="","",ROUND(E${x}+(E${x}*${pct(c.clickBuffer)}),0))`
    : r.isHead
      ? null
      : `=MAX(F${x - 1}-G${x - 1},0)`;

  const cells: (string | number | null)[] = [
    r.name, // A
    r.campaignType, // B
    r.start, // C
    r.end, // D
    r.totalClicks, // E
    F, // F
    r.achievedClicks, // G
    wrap(`=IF(OR(F${x}="",G${x}=""),"",MAX(F${x}-G${x},0))`), // H
    wrap(`=IF(OR(G${x}="",J${x}="",J${x}=0),"",G${x}/J${x})`), // I
    r.impressions, // J
    wrap(`=IF(OR(H${x}="",I${x}="",I${x}=0),"",ROUND(H${x}/I${x},0))`), // K
    wrap(`=IF(OR(J${x}="",K${x}=""),"",J${x}+K${x})`), // L
    r.mediaCost, // M
    wrap(`=IF(M${x}="","",M${x}*${pct(c.fsRate)})`), // N
    // O: the latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    r.isLatest ? wrap(`=IF(L${x}="","",(L${x}/1000)*${c.novaCpm})`) : `=IF(J${x}="","",(J${x}/1000)*${c.novaCpm})`, // O
    r.isChild ? null : `=IF(E${x}="","",E${x}*${c.clientCpc})`, // P
    r.isHead ? `=IF(${noBudget},"",P${x}-${sumIf('M')}-${sumIf('N')}-${sumIf('O')})` : null, // Q
    r.isHead ? `=IF(Q${x}="","",Q${x}/P${x})` : null, // R
    iferror(healthFormula(x, c)), // S
    wrap(`=MAX(0,ROUNDUP(D${x}-TODAY(),0))`), // T
    r.comment || null, // U
    r.isLatest ? `=IFERROR(IF(J${x}>0,M${x}/J${x}*L${x},M${x}),M${x})` : `=M${x}`, // V
    r.isHead ? `=IF(${noBudget},"",P${x}-${sumIf('V')}*(1+${c.fsRate})-${sumIf('O')})` : null, // W
    r.isHead ? `=IF(W${x}="","",W${x}/P${x})` : null, // X
    margin(`G${x}`, `M${x}`, `J${x}`), // Y: this IO
    r.isHead ? margin(sumIf('G'), sumIf('M'), sumIf('J')) : null, // Z: all IOs of the campaign
    null, // AA
    null, // AB
    r.groupKey, // AC
  ];
  return cells.map((value) => ({ value }));
}

export function buildTimeOutSheetSpec(result: TimeOutResult, config: TimeOutConfig, title = 'Report'): SheetSpec {
  return {
    title,
    headers: TIMEOUT_HEADERS,
    rows: result.rows.map((r, i) => rowCells(r, i + 2, config)),
    hiddenColumns: [TIMEOUT_GROUP_KEY_COLUMN],
  };
}
