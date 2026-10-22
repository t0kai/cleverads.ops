import { z } from 'zod';
import { ValidationError } from '@/shared/errors';

/**
 * Ufurnish settings. This module stands on its own: nothing here is shared with another advertiser,
 * so changing another advertiser's settings never changes Ufurnish.
 *
 * Ufurnish is billed in GBP (CPC £0.23, CPCV £0.04); DV360 costs arrive in A$. Each campaign's A$ budget is taken
 * from the "Budget (AUD)" column of the Campaign Tracker, and every margin is worked out in A$.
 */
export const UfurnishConfigSchema = z.object({
  /** Client price per click, £ (shown in Settings; the tracker holds the budget). */
  clientCpcGbp: z.number().positive().default(0.23),
  /** Client price per completed view, £. */
  clientCpcvGbp: z.number().positive().default(0.04),
  /** A$ per click, used only when the tracker has no Budget (AUD) for a CPC campaign. */
  fallbackCpcAud: z.number().positive().default(0.44),
  /** A$ per view, used only when the tracker has no Budget (AUD) for a CPCV campaign. */
  fallbackCpcvAud: z.number().positive().default(0.08),
  /** Targeted = Total target × (1 + buffer). Display only. */
  targetBuffer: z.number().min(0).max(1).default(0.1),
  /** FS service fee, share of media cost */
  fsRate: z.number().min(0).max(1).default(0.15),
  /** Nova fee, A$ per 1,000 impressions */
  novaCpm: z.number().min(0).default(0.8),
  /** Below this projected margin → Margin Issue tab + red */
  minMargin: z.number().min(0).max(1).default(0.75),
  urgentDays: z.number().int().min(0).max(90).default(6),
  newCampaignDays: z.number().int().min(0).max(90).default(7),
  endHighlightDays: z.number().int().min(0).max(90).default(10),
  daysRed: z.number().int().min(0).default(3),
  daysOrange: z.number().int().min(0).default(10),
  ctrLow: z.number().min(0).max(1).default(0.01),
  ctrHigh: z.number().min(0).max(1).default(0.04),
  /** Health bands around the expected pace (share of target) */
  paceAhead: z.number().min(0).default(0.05),
  paceOnTrack: z.number().min(0).default(0.05),
  paceBehind: z.number().min(0).default(0.15),
});

export type UfurnishConfig = Readonly<z.infer<typeof UfurnishConfigSchema>>;

export const UFURNISH_DEFAULTS: UfurnishConfig = Object.freeze(UfurnishConfigSchema.parse({}));

export function parseUfurnishConfig(raw: unknown): UfurnishConfig {
  const parsed = UfurnishConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      'Some Ufurnish settings are not valid.',
      parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`),
      'Open Ufurnish settings and correct the highlighted boxes.',
    );
  }
  if (parsed.data.ctrLow > parsed.data.ctrHigh) {
    throw new ValidationError('Some Ufurnish settings are not valid.', ['Healthy CTR range: the low end is above the high end.']);
  }
  return Object.freeze(parsed.data);
}
