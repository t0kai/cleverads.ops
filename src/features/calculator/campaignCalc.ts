/**
 * Campaign Calculator — same rules as the marketing-calculator site:
 * Inventory = media × 1.10 (DV360 10%), FS = media × 4.5%, Nova = A$0.80 per 1,000 impressions.
 * Profit = Budget − (Inventory + FS + Nova), solved for impressions.
 */
export const CALC_RATES = { dvFee: 0.1, fsFee: 0.045, novaCpm: 0.8 } as const;

export interface CalcInput {
  readonly budget: number;
  /** 0–1 */
  readonly margin: number;
  readonly clicks: number;
  readonly cpm: number;
}

export interface CalcResult {
  readonly impressions: number;
  readonly ctr: number;
  readonly media: number;
  readonly inventory: number;
  readonly fs: number;
  readonly nova: number;
  readonly totalCost: number;
  readonly profit: number;
}

export function campaignCalc({ budget, margin, clicks, cpm }: CalcInput): CalcResult | null {
  if (!(budget > 0) || !(margin > 0) || margin >= 1 || !(clicks > 0) || !(cpm > 0)) return null;
  const costPerThousand = cpm * (1 + CALC_RATES.dvFee + CALC_RATES.fsFee) + CALC_RATES.novaCpm;
  const impressions = Math.floor(((budget * (1 - margin)) / costPerThousand) * 1000);
  if (impressions <= 0) return null;
  const media = (cpm * impressions) / 1000;
  const inventory = media * (1 + CALC_RATES.dvFee);
  const fs = media * CALC_RATES.fsFee;
  const nova = (CALC_RATES.novaCpm * impressions) / 1000;
  return { impressions, ctr: clicks / impressions, media, inventory, fs, nova, totalCost: inventory + fs + nova, profit: budget * margin };
}
