/**
 * Performance Analytics data model. One row = one advertiser in one month, in AUD.
 * Rates (CTR, eCPM, eCPC) are never stored: they are always worked out from totals,
 * so an average of averages can never sneak in.
 */
export interface MonthRow {
  readonly advertiser: string;
  /** "YYYY-MM" */
  readonly month: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly media: number;
  readonly dv: number;
  readonly fs: number;
  /** media + dv + fs */
  readonly total: number;
}

/** Which cost the rates use: everything we bill (total) or only what publishers were paid (media). */
export type CostBasis = 'total' | 'media';
export type Rate = 'cpm' | 'cpc';
export type Grain = 'month' | 'quarter' | 'half' | 'year';

export interface Totals {
  readonly cost: number;
  readonly media: number;
  readonly impressions: number;
  readonly clicks: number;
  /** cost per 1,000 impressions; null when there were no impressions */
  readonly cpm: number | null;
  /** cost per click; null when there were no clicks */
  readonly cpc: number | null;
  /** clicks ÷ impressions as a fraction (0.0163 = 1.63%) */
  readonly ctr: number | null;
}

/** A problem found in one sheet row. The row is skipped; everything else still loads. */
export interface RowWarning {
  /** Row number as shown in Google Sheets (header is row 1). */
  readonly row: number;
  readonly message: string;
}

/** What the API sends to the browser. */
export interface AnalyticsPayload {
  readonly rows: readonly MonthRow[];
  readonly warnings: readonly RowWarning[];
  /** ISO time the server read the sheet. */
  readonly fetchedAt: string;
}
