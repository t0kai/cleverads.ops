import { z } from 'zod';
import { ValidationError } from '@/shared/errors';

/**
 * Benzinga (US) settings. This module stands on its own: nothing here is shared with another advertiser,
 * so changing another advertiser's settings never changes Benzinga.
 *
 * Benzinga is billed in US dollars; DV360 costs arrive in Australian dollars. Each campaign's budget is turned
 * into A$ with the USD → AUD rate typed into its tracker row, and every margin is worked out in A$.
 */
export const BenzingaConfigSchema = z.object({
  /** Client price per click, US$. CPC campaigns: Budget (USD) = Click Target × CPC. */
  clientCpcUsd: z.number().positive().default(0.35),
  /** Targeted = Total target × (1 + buffer), for clicks and impressions alike. Display only. */
  targetBuffer: z.number().min(0).max(1).default(0.1),
  /** DV360/FS platform fee, share of inventory cost. The tracker uses 4.5% ÷ 1.1. */
  fsRate: z.number().min(0).max(1).default(0.045 / 1.1),
  /** Nova fee, A$ per 1,000 impressions */
  novaCpm: z.number().min(0).default(0.8),
  /** Below this projected margin → Margin Issue tab + red */
  minMargin: z.number().min(0).max(1).default(0.75),
  urgentDays: z.number().int().min(0).max(90).default(12),
  newCampaignDays: z.number().int().min(0).max(90).default(7),
  endHighlightDays: z.number().int().min(0).max(90).default(10),
  daysRed: z.number().int().min(0).default(3),
  daysOrange: z.number().int().min(0).default(10),
  ctrLow: z.number().min(0).max(1).default(0.014),
  ctrHigh: z.number().min(0).max(1).default(0.045),
  /** Health bands around the expected pace (share of target) */
  paceAhead: z.number().min(0).default(0.05),
  paceOnTrack: z.number().min(0).default(0.05),
  paceBehind: z.number().min(0).default(0.15),
});

export type BenzingaConfig = Readonly<z.infer<typeof BenzingaConfigSchema>>;

export const BENZINGA_DEFAULTS: BenzingaConfig = Object.freeze(BenzingaConfigSchema.parse({}));

export function parseBenzingaConfig(raw: unknown): BenzingaConfig {
  const parsed = BenzingaConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      'Some Benzinga settings are not valid.',
      parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`),
      'Open Benzinga settings and correct the highlighted boxes.',
    );
  }
  if (parsed.data.ctrLow > parsed.data.ctrHigh) {
    throw new ValidationError('Some Benzinga settings are not valid.', ['Healthy CTR range: the low end is above the high end.']);
  }
  return Object.freeze(parsed.data);
}
