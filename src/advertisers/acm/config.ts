import { z } from 'zod';
import { ValidationError } from '@/shared/errors';

/**
 * ACM rules. Defaults match the Apps Script v2 and the template Formula tab.
 * At run time these come from the Hub Data sheet and are validated here; nothing is hard-coded in the maths.
 */
export const AcmConfigSchema = z.object({
  /** Targeted Clicks = Total Clicks × (1 + buffer) */
  clickBuffer: z.number().min(0).max(1).default(0.1),
  /** Client price per click, A$ (Budget = Total Clicks × CPC) */
  clientCpc: z.number().positive().default(0.6),
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

export type AcmConfig = Readonly<z.infer<typeof AcmConfigSchema>>;

export const ACM_DEFAULTS: AcmConfig = Object.freeze(AcmConfigSchema.parse({}));

export function parseAcmConfig(raw: unknown): AcmConfig {
  const parsed = AcmConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      'Some ACM settings are not valid.',
      parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`),
      'Open ACM settings and correct the highlighted boxes.',
    );
  }
  if (parsed.data.ctrLow > parsed.data.ctrHigh) {
    throw new ValidationError('Some ACM settings are not valid.', ['Healthy CTR range: the low end is above the high end.']);
  }
  return Object.freeze(parsed.data);
}
