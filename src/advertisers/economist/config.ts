import { z } from 'zod';
import { ValidationError } from '@/shared/errors';

/**
 * The Economist settings. This module stands on its own: nothing here is shared with another advertiser,
 * so changing another advertiser's settings never changes The Economist.
 *
 * The Economist is billed in £, with a different CPC for every country (Budget (GBP) ÷ Click Target on its tracker row);
 * DV360 costs arrive in A$. Each campaign's A$ budget is taken from the "Budget (AUD)" column of the Campaign Tracker,
 * and every margin is worked out in A$.
 */
export const EconomistConfigSchema = z.object({
  /** Targeted = Total Clicks × (1 + buffer). Display only. */
  targetBuffer: z.number().min(0).max(1).default(0.1),
  /** DV360/FS platform fee, share of inventory cost. The tracker uses (cost ÷ 1.1) × 4.5%. */
  fsRate: z.number().min(0).max(1).default(0.045 / 1.1),
  /** Nova fee, A$ per 1,000 Nova impressions */
  novaCpm: z.number().min(0).default(0.8),
  /** Share of impressions that carry the Nova fee. The Economist runs Nova creatives: 100% unless changed in the sheet. */
  novaShare: z.number().min(0).max(1).default(1),
  /** Below this projected margin → Margin Issue tab + red */
  minMargin: z.number().min(0).max(1).default(0.75),
  urgentDays: z.number().int().min(0).max(90).default(5),
  newCampaignDays: z.number().int().min(0).max(90).default(7),
  endHighlightDays: z.number().int().min(0).max(90).default(10),
  daysRed: z.number().int().min(0).default(3),
  daysOrange: z.number().int().min(0).default(10),
  /** Healthy CTR: at least ctrLow and below ctrHigh. */
  ctrLow: z.number().min(0).max(1).default(0.01),
  ctrHigh: z.number().min(0).max(1).default(0.04),
  /** Health bands around the expected pace (share of target) */
  paceAhead: z.number().min(0).default(0.05),
  paceOnTrack: z.number().min(0).default(0.05),
  paceBehind: z.number().min(0).default(0.15),
});

export type EconomistConfig = Readonly<z.infer<typeof EconomistConfigSchema>>;

export const ECONOMIST_DEFAULTS: EconomistConfig = Object.freeze(EconomistConfigSchema.parse({}));

export function parseEconomistConfig(raw: unknown): EconomistConfig {
  const parsed = EconomistConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      'Some The Economist settings are not valid.',
      parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`),
      'Open The Economist settings and correct the highlighted boxes.',
    );
  }
  if (parsed.data.ctrLow > parsed.data.ctrHigh) {
    throw new ValidationError('Some The Economist settings are not valid.', ['Healthy CTR range: the low end is above the high end.']);
  }
  return Object.freeze(parsed.data);
}
