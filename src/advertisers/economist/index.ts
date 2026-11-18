import type { AdvertiserModule, ModuleInput } from '../types';
import { parseEconomistConfig, type EconomistConfig } from './config';
import { calculateEconomist, type EconomistInput, type EconomistResult, type EconomistTarget } from './rules';
import { buildEconomistSheetSpec } from './sheet';

/** Accepts the shared input shape too (click targets only), so the module keeps the common contract. */
function toEconomistInput(input: ModuleInput | EconomistInput): EconomistInput {
  const targets = new Map<string, EconomistTarget>();
  for (const [key, t] of input.targets) {
    targets.set(key, 'target' in t ? t : { start: t.start, end: t.end, target: t.clicks, budgetAud: null, budgetGbp: null, fx: null });
  }
  return { rows: input.rows, targets, today: input.today };
}

/**
 * The Economist rules v1: billed in £ with a CPC per country, costs in A$, each country's A$ budget from the tracker;
 * Nova fee only on the Nova share of impressions (100% by default, editable in the sheet);
 * IOs "<campaign> IO", "<campaign> IO #2" … count as one campaign.
 * Self-contained: imports only engine/, shared/ and the common module contract, never another advertiser.
 */
export const economistModule: AdvertiserModule<EconomistConfig, EconomistResult> = {
  id: 'economist',
  version: '1.0',
  parseConfig: parseEconomistConfig,
  calculate: (input: ModuleInput | EconomistInput, config: EconomistConfig) => calculateEconomist(toEconomistInput(input), config),
  buildSheetSpec: (result, config) => buildEconomistSheetSpec(result, config),
};

export { calculateEconomist } from './rules';
export { ECONOMIST_DEFAULTS, parseEconomistConfig } from './config';
export { groupEconomistCampaigns } from './names';
export { ECON_COL, ECON_COLUMNS, ECON_DATA_COLUMNS, ECON_GROUP_KEY_COLUMN, ECON_HEADERS, ECON_LETTER, economistRowValues } from './sheet';
export type { EconColumn } from './sheet';
export type { EconomistConfig } from './config';
export type { EconomistGroupResult, EconomistInput, EconomistResult, EconomistRow, EconomistTarget } from './rules';
