import type { AdvertiserModule, ModuleInput } from '../types';
import { parseBusinessInsiderConfig, type BusinessInsiderConfig } from './config';
import { calculateBusinessInsider, type BusinessInsiderInput, type BusinessInsiderResult, type BusinessInsiderTarget } from './rules';
import { buildBusinessInsiderSheetSpec } from './sheet';

/** Accepts the shared input shape too (click targets only), so the module keeps the common contract. */
function toBusinessInsiderInput(input: ModuleInput | BusinessInsiderInput): BusinessInsiderInput {
  const targets = new Map<string, BusinessInsiderTarget>();
  for (const [key, t] of input.targets) {
    targets.set(key, 'target' in t ? t : { start: t.start, end: t.end, target: t.clicks, budgetAud: null, budgetUsd: null, fx: null });
  }
  return { rows: input.rows, targets, today: input.today };
}

/**
 * Business Insider rules v1: billed in US$ (CPC US$0.08), costs in A$, each campaign's A$ budget from the tracker;
 * Nova fee only on the Nova share of impressions (0% by default, editable in the sheet);
 * IOs "<campaign> IO", "<campaign> 2 IO" … count as one campaign.
 * Self-contained: imports only engine/, shared/ and the common module contract, never another advertiser.
 */
export const businessInsiderModule: AdvertiserModule<BusinessInsiderConfig, BusinessInsiderResult> = {
  id: 'businessinsider',
  version: '1.0',
  parseConfig: parseBusinessInsiderConfig,
  calculate: (input: ModuleInput | BusinessInsiderInput, config: BusinessInsiderConfig) => calculateBusinessInsider(toBusinessInsiderInput(input), config),
  buildSheetSpec: (result, config) => buildBusinessInsiderSheetSpec(result, config),
};

export { calculateBusinessInsider } from './rules';
export { BUSINESS_INSIDER_DEFAULTS, parseBusinessInsiderConfig } from './config';
export { groupBusinessInsiderCampaigns } from './names';
export { BI_COL, BI_COLUMNS, BI_DATA_COLUMNS, BI_GROUP_KEY_COLUMN, BI_HEADERS, BI_LETTER, businessInsiderRowValues } from './sheet';
export type { BiColumn } from './sheet';
export type { BusinessInsiderConfig } from './config';
export type { BusinessInsiderGroupResult, BusinessInsiderInput, BusinessInsiderResult, BusinessInsiderRow, BusinessInsiderTarget } from './rules';
