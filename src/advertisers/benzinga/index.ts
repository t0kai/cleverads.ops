import type { AdvertiserModule, ModuleInput } from '../types';
import { parseBenzingaConfig, type BenzingaConfig } from './config';
import { calculateBenzinga, type BenzingaInput, type BenzingaResult, type BenzingaTarget } from './rules';
import { buildBenzingaSheetSpec } from './sheet';

/** Accepts the shared input shape too (click targets only), so the module keeps the common contract. */
function toBenzingaInput(input: ModuleInput | BenzingaInput): BenzingaInput {
  const targets = new Map<string, BenzingaTarget>();
  for (const [key, t] of input.targets) {
    targets.set(key, 'target' in t ? t : { start: t.start, end: t.end, target: t.clicks, budgetUsd: null, fx: null, buyingType: null });
  }
  return { rows: input.rows, targets, today: input.today };
}

/**
 * Benzinga (US) rules v1: billed in US$ (CPC US$0.35; CPM from the tracker budget), costs in A$, each campaign's
 * USD → AUD rate from the tracker; IOs "#2 … #N" and month-split tracker rows count as one campaign.
 * Self-contained: imports only engine/, shared/ and the common module contract, never another advertiser.
 */
export const benzingaModule: AdvertiserModule<BenzingaConfig, BenzingaResult> = {
  id: 'benzinga',
  version: '1.0',
  parseConfig: parseBenzingaConfig,
  calculate: (input: ModuleInput | BenzingaInput, config: BenzingaConfig) => calculateBenzinga(toBenzingaInput(input), config),
  buildSheetSpec: (result, config) => buildBenzingaSheetSpec(result, config),
};

export { calculateBenzinga, mergeTargets } from './rules';
export { BENZINGA_DEFAULTS, parseBenzingaConfig } from './config';
export { groupBenzingaCampaigns, parseBuyingType } from './names';
export { BENZINGA_DATA_COLUMNS, BENZINGA_GROUP_KEY_COLUMN, BENZINGA_HEADERS } from './sheet';
export type { BenzingaConfig } from './config';
export type { BuyingType } from './names';
export type { BenzingaGroupResult, BenzingaInput, BenzingaResult, BenzingaRow, BenzingaTarget, CampaignTarget } from './rules';
