import type { SheetCell, SheetSpec } from '../types';
import type { AcmConfig } from './config';
import type { AcmResult, AcmRow } from './rules';

/**
 * The Report tab as the sheet will hold it: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Formulas are the template's (Formula tab),
 * with the rates taken from config instead of being typed in.
 */
export const ACM_HEADERS = [
  'Campaign name', 'Start date', 'End date', 'Total Clicks', 'Targeted Clicks', 'Achieved Clicks',
  'Required Clicks (without extra)', 'Actual Average CTR', 'Impressions spent', 'Impression needed for required clicks',
  'Required Total Impression', 'Inventory cost', 'FS Service fee', 'Nova fee', 'Budget', 'Net profit',
  'Margin %', 'Campaign Health', 'Remaing Days', 'Comment', 'Projected Media Cost', 'Projected Net Profit',
  'Projected Margin %', 'IO Margin %', 'Overall Margin %', '', 'Last Updated:', 'Group Key',
] as const;

/** Column AB (28th) holds the group key and is hidden. */
export const GROUP_KEY_COLUMN = 28;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;

/** Column G (0-based 6): what the campaign still needs. */
export const ACM_REQUIRED_COLUMN = 6;
/** Hover note on the Required Clicks header, so anyone reading the sheet knows the extra is left out. */
export const requiredNote = (c: Pick<AcmConfig, 'clickBuffer'>) =>
  `Clicks still needed = Total Clicks − every IO's Achieved Clicks (main + 2nd + 3rd). Does not include the ${pct(c.clickBuffer)} extra in Targeted Clicks. Shown on the campaign's last IO.`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

/**
 * Campaign Health for row x. `tgt` is the campaign's Total Clicks (main IO, no buffer) and `ach` all its IOs' clicks,
 * so every IO of a campaign shows the campaign's pace and the clicks still needed per day.
 */
function healthFormula(x: number, tgt: string, ach: string, c: AcmConfig): string {
  const pace = `((TODAY()-B${x}+1)/(C${x}-B${x}+1))`;
  const perDay = `ROUND((${tgt}-${ach})/MAX(1,C${x}-TODAY()),0)&"/day"`;
  return (
    `=IFERROR(IF(OR(${tgt}="",B${x}="",C${x}=""),"",IF(${ach}>=${tgt},"🟢 Completed",IF(TODAY()<B${x},"Not Started",IF(TODAY()>C${x},"Ended",` +
    `IF((${ach}/${tgt})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((${ach}/${tgt})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay}))))))),"")`
  );
}

/** `h` is the sheet row of the campaign's first IO (it holds Total and Targeted Clicks). */
function rowCells(r: AcmRow, x: number, h: number, c: AcmConfig): SheetCell[] {
  const wrap = (f: string) => (r.isChild ? iferror(f) : f);
  const sumIf = (col: string) => `SUMIF($AB$2:$AB,$AB${x},$${col}$2:$${col})`;
  const fsUp = `(1+${c.fsRate})`;
  const noBudget = `OR(O${x}="",O${x}=0)`;

  // One target per campaign, on the main IO. Every IO's clicks count towards it.
  const E = r.isChild ? null : `=IF(D${x}="","",ROUND(D${x}+(D${x}*${pct(c.clickBuffer)}),0))`;
  // Still needed and Health count from Total Clicks (no buffer), minus every IO's clicks.
  const tgt = `$D$${h}`;
  const ach = sumIf('F');

  const cells: (string | number | null)[] = [
    r.name,
    r.start,
    r.end,
    r.totalClicks,
    E,
    r.achievedClicks,
    // G: what the campaign still needs, shown once, on its last IO.
    r.isLatest ? iferror(`=IF(${tgt}="","",MAX(${tgt}-${ach},0))`) : null,
    wrap(`=IF(OR(F${x}="",I${x}="",I${x}=0),"",F${x}/I${x})`),
    r.impressions,
    r.isLatest ? wrap(`=IF(OR(G${x}="",H${x}="",H${x}=0),"",ROUND(G${x}/H${x},0))`) : null,
    r.isLatest ? wrap(`=IF(OR(I${x}="",J${x}=""),"",I${x}+J${x})`) : null,
    r.mediaCost,
    wrap(`=IF(L${x}="","",L${x}*${pct(c.fsRate)})`),
    // Nova: the latest IO is costed on the impressions it still needs; earlier IOs on what they have spent.
    r.isLatest ? wrap(`=IF(K${x}="","",(K${x}/1000)*${c.novaCpm})`) : `=IF(I${x}="","",(I${x}/1000)*${c.novaCpm})`,
    r.isChild ? null : `=IF(D${x}="","",D${x}*${c.clientCpc})`,
    r.isHead ? `=IF(${noBudget},"",O${x}-${sumIf('L')}-${sumIf('M')}-${sumIf('N')})` : null,
    r.isHead ? `=IF(P${x}="","",P${x}/O${x})` : null,
    healthFormula(x, tgt, ach, c),
    wrap(`=MAX(0,ROUNDUP(C${x}-TODAY(),0))`),
    r.comment || null,
    r.isLatest ? `=IFERROR(IF(I${x}>0,L${x}/I${x}*K${x},L${x}),L${x})` : `=L${x}`,
    r.isHead ? `=IF(${noBudget},"",O${x}-${sumIf('U')}*(1+${c.fsRate})-${sumIf('N')})` : null,
    r.isHead ? `=IF(V${x}="","",V${x}/O${x})` : null,
    // X: this IO's margin on the clicks it has delivered. Y: all IOs of the campaign together (head row).
    `=IFERROR((F${x}*${c.clientCpc}-L${x}*${fsUp}-(I${x}/1000)*${c.novaCpm})/(F${x}*${c.clientCpc}),"")`,
    r.isHead
      ? `=IFERROR((${sumIf('F')}*${c.clientCpc}-${sumIf('L')}*${fsUp}-(${sumIf('I')}/1000)*${c.novaCpm})/(${sumIf('F')}*${c.clientCpc}),"")`
      : null,
    null,
    null,
    r.groupKey,
  ];
  return cells.map((value) => ({ value }));
}

export function buildAcmSheetSpec(result: AcmResult, config: AcmConfig, title = 'Report'): SheetSpec {
  return {
    title,
    headers: ACM_HEADERS,
    rows: (() => {
      let head = 2;
      return result.rows.map((r, i) => {
        if (r.isHead) head = i + 2;
        return rowCells(r, i + 2, head, config);
      });
    })(),
    hiddenColumns: [GROUP_KEY_COLUMN],
    headerNotes: { [ACM_REQUIRED_COLUMN]: requiredNote(config) },
  };
}
