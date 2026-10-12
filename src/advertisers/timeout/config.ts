import { z } from 'zod';
import { ValidationError } from '@/shared/errors';

/**
 * Time Out settings. This module stands on its own: nothing here is shared with another advertiser,
 * so changing another advertiser's settings never changes Time Out.
 *
 * Note (Oct 2026): every Time Out campaign is counted as CPC for now. A CPC / CPCV choice per campaign
 * (CPCV A$0.20, needs the "Complete Views (Video)" column in the DV360 CSV; CPM A$1.50) is planned for later.
 */
export const TimeOutConfigSchema = z.object({
  /** Client price per click, A$. Budget = Clicks/View Target × CPC. */
  clientCpc: z.number().positive().default(0.3),
  /** Client price per 1,000 impressions, A$, for CPM campaigns. Stored now; used once the campaign type choice is added. */
  clientCpm: z.number().positive().default(1.5),
  /** Targeted Clicks = Total Clicks × (1 + buffer) */
  clickBuffer: z.number().min(0).max(1).default(0.1),
  /** FS service fee, share of media cost */
  fsRate: z.number().min(0).max(1).default(0.15),
  /** Nova fee, A$ per 1,000 impressions */
  novaCpm: z.number().min(0).default(0.8),
  /** Below this projected margin → Margin Issue tab + red */
  minMargin: z.number().min(0).max(1).default(0.75),
  urgentDays: z.number().int().min(0).max(90).default(12),
  newCampaignDays: z.number().int().min(0).max(90).default(7),
  endHighlightDays: z.number().int().min(0).max(90).default(10),
  daysRed: z.number().int().min(0).default(3),
  daysOrange: z.number().int().min(0).default(10),
  /** Healthy CTR range: 1.5% to 3%. */
  ctrLow: z.number().min(0).max(1).default(0.015),
  ctrHigh: z.number().min(0).max(1).default(0.03),
  /** Health bands around the expected pace (share of target) */
  paceAhead: z.number().min(0).default(0.05),
  paceOnTrack: z.number().min(0).default(0.05),
  paceBehind: z.number().min(0).default(0.15),
});

export type TimeOutConfig = Readonly<z.infer<typeof TimeOutConfigSchema>>;

export const TIMEOUT_DEFAULTS: TimeOutConfig = Object.freeze(TimeOutConfigSchema.parse({}));

/** Shown in the Campaign Type column and the Settings tab until the CPC / CPCV choice arrives. */
export const TIMEOUT_CAMPAIGN_TYPE = 'CPC';

export function parseTimeOutConfig(raw: unknown): TimeOutConfig {
  const parsed = TimeOutConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      'Some Time Out settings are not valid.',
      parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`),
      'Open Time Out settings and correct the highlighted boxes.',
    );
  }
  if (parsed.data.ctrLow > parsed.data.ctrHigh) {
    throw new ValidationError('Some Time Out settings are not valid.', ['Healthy CTR range: the low end is above the high end.']);
  }
  return Object.freeze(parsed.data);
}
