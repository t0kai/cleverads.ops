import { z } from 'zod';
import { ValidationError } from '@/shared/errors';

/**
 * Pinstripe (Private Media Operations) settings. This module stands on its own: nothing here is
 * shared with another advertiser, so changing another advertiser's settings never changes Pinstripe.
 */
export const PinstripeConfigSchema = z.object({
  /** Client price per click, A$. Click campaigns: Budget = Click Target × CPC. */
  clientCpc: z.number().positive().default(0.4),
  /** A tracker target at or above this is an impression campaign (its Budget comes from the tracker). */
  impressionTargetFrom: z.number().int().positive().default(100_000),
  /** Targeted = Total target × (1 + buffer), for clicks and impressions alike. */
  targetBuffer: z.number().min(0).max(1).default(0.1),
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
  ctrLow: z.number().min(0).max(1).default(0.013),
  ctrHigh: z.number().min(0).max(1).default(0.024),
  /** Health bands around the expected pace (share of target) */
  paceAhead: z.number().min(0).default(0.05),
  paceOnTrack: z.number().min(0).default(0.05),
  paceBehind: z.number().min(0).default(0.15),
});

export type PinstripeConfig = Readonly<z.infer<typeof PinstripeConfigSchema>>;

export const PINSTRIPE_DEFAULTS: PinstripeConfig = Object.freeze(PinstripeConfigSchema.parse({}));

export function parsePinstripeConfig(raw: unknown): PinstripeConfig {
  const parsed = PinstripeConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      'Some Pinstripe settings are not valid.',
      parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`),
      'Open Pinstripe settings and correct the highlighted boxes.',
    );
  }
  if (parsed.data.ctrLow > parsed.data.ctrHigh) {
    throw new ValidationError('Some Pinstripe settings are not valid.', ['Healthy CTR range: the low end is above the high end.']);
  }
  return Object.freeze(parsed.data);
}
