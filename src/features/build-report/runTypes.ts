import type { exportLinks } from '@/adapters/sheets/sheetsApi';
import type { Dv360Row } from '@/engine/csv/dv360';

/**
 * What the report page needs from any advertiser's builder. Each advertiser has its own builder
 * (buildAcmReport, buildPinstripeReport, …); this file only names the shape they all return.
 */
export type BuildStep = 'targets' | 'calculate' | 'create' | 'write';

export interface ReportBuildResult {
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
  /** Extra line under the result, e.g. "18 click · 2 impression campaigns". */
  readonly breakdown?: string;
}

export interface RunInput {
  readonly token: string;
  readonly rows: readonly Dv360Row[];
  readonly reportTimeZone: string;
  readonly onStep?: (step: BuildStep) => void;
}
