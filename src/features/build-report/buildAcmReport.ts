import { moveToFolder } from '@/adapters/drive/driveApi';
import { batchUpdate, copySheetTo, createSpreadsheet, exportLinks, getSpreadsheetMeta, getValues } from '@/adapters/sheets/sheetsApi';
import { acmModule, type AcmConfig, type AcmResult } from '@/advertisers/acm';
import type { ReportSources } from '@/content/advertisers';
import type { Dv360Row } from '@/engine/csv/dv360';
import { todaySerial } from '@/engine/dates/serial';
import { AccessError, AppError, ModuleError, ValidationError } from '@/shared/errors';
import { newRunId } from '@/shared/ids';
import { buildReportRequests, formatLastUpdated, isoDay } from './acmSheetRequests';
import { parseTargets } from './targets';

/**
 * One click of "Build optimization sheet": tracker → maths → new spreadsheet in the Results folder.
 * Nothing is written to Google until the maths has finished without errors.
 */
export type BuildStep = 'targets' | 'calculate' | 'create' | 'write';

export interface BuildInput {
  readonly token: string;
  readonly rows: readonly Dv360Row[];
  readonly sources: ReportSources;
  readonly config: AcmConfig;
  readonly reportTimeZone: string;
  readonly now?: Date;
  readonly onStep?: (step: BuildStep) => void;
}

export interface BuildResult {
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly name: string;
  readonly url: string;
  readonly downloads: ReturnType<typeof exportLinks>;
  readonly ioCount: number;
  readonly urgentCampaigns: number;
  readonly marginCampaigns: number;
  readonly lowestMargin: number | null;
  /** False when Drive did not let the app put the file in the Results folder (it stays in My Drive). */
  readonly inResultsFolder: boolean;
  readonly warnings: readonly string[];
}

const SHEET_IDS = { urgent: 1001, margin: 1002 } as const;

/** Re-label access errors so the user knows which file is the problem. */
async function step<T>(what: string, url: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof AccessError) throw new AccessError(`No access to ${what}.`, url, e);
    throw e;
  }
}

export async function buildAcmReport(input: BuildInput): Promise<BuildResult> {
  const { token, rows, sources, config, reportTimeZone, onStep } = input;
  const now = input.now ?? new Date();
  const runId = newRunId();
  if (!rows.length) throw new ValidationError('The CSV has no insertion orders.');

  // 1. Targets from the Campaign Tracker
  onStep?.('targets');
  const trackerUrl = `https://docs.google.com/spreadsheets/d/${sources.trackerId}/edit`;
  const trackerMeta = await step('the Campaign Tracker', trackerUrl, () => getSpreadsheetMeta(token, sources.trackerId));
  if (!trackerMeta.sheets.some((s) => s.title === sources.trackerTab)) {
    throw new ValidationError(`The Campaign Tracker has no "${sources.trackerTab}" tab.`, [], 'Check the tab name in the advertiser settings.');
  }
  const values = await step('the Campaign Tracker', trackerUrl, () =>
    getValues(token, sources.trackerId, `'${sources.trackerTab.replace(/'/g, "''")}'!A${sources.trackerHeaderRow}:AZ`),
  );
  const { targets } = parseTargets(values, { trackerTimeZone: trackerMeta.timeZone || 'Australia/Sydney', reportTimeZone });

  // 2. Maths (pure; a bug here stops before anything is written)
  onStep?.('calculate');
  const today = todaySerial(reportTimeZone, now);
  let result: AcmResult;
  let spec: ReturnType<typeof acmModule.buildSheetSpec>;
  try {
    result = acmModule.calculate({ rows, targets, today }, config);
    spec = acmModule.buildSheetSpec(result, config);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new ModuleError('acm', runId, e);
  }

  // 3. New spreadsheet + the template's Formula tab
  onStep?.('create');
  const name = sources.reportPrefix + isoDay(now, reportTimeZone);
  const templateUrl = `https://docs.google.com/spreadsheets/d/${sources.templateId}/edit`;
  const templateMeta = await step('the ACM template sheet', templateUrl, () => getSpreadsheetMeta(token, sources.templateId));
  const templateTab = templateMeta.sheets.find((s) => s.title === sources.templateTab);
  if (!templateTab) throw new ValidationError(`The template has no "${sources.templateTab}" tab.`, [], 'Check the template in the advertiser settings.');

  const created = await createSpreadsheet(token, name, reportTimeZone, 'en_GB');
  const reportTab = created.sheets[0];
  if (!reportTab) throw new ValidationError('Google created the spreadsheet without a tab.', [], 'Try again.');
  const formulaTab = await step('the ACM template sheet', templateUrl, () => copySheetTo(token, sources.templateId, templateTab.sheetId, created.spreadsheetId));

  let inResultsFolder = true;
  try {
    await moveToFolder(token, created.spreadsheetId, sources.outputFolderId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    inResultsFolder = false;
  }

  // 4. Write every tab in one change
  onStep?.('write');
  await batchUpdate(
    token,
    created.spreadsheetId,
    buildReportRequests({
      ids: { report: reportTab.sheetId, urgent: SHEET_IDS.urgent, margin: SHEET_IDS.margin, formula: formulaTab.sheetId },
      spec,
      result,
      config,
      lastUpdated: formatLastUpdated(now, reportTimeZone),
    }),
  );

  return {
    runId,
    spreadsheetId: created.spreadsheetId,
    name,
    url: created.url,
    downloads: exportLinks(created.spreadsheetId, reportTab.sheetId),
    ioCount: result.rows.length,
    urgentCampaigns: result.urgent.length,
    marginCampaigns: result.marginIssues.length,
    lowestMargin: result.marginIssues[0]?.head.projectedMargin ?? null,
    inResultsFolder,
    warnings: result.warnings,
  };
}
