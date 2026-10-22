import type { AdvertiserModule, ModuleInput } from '../types';
import { parseUfurnishConfig, type UfurnishConfig } from './config';
import { calculateUfurnish, type UfurnishInput, type UfurnishResult, type UfurnishTarget } from './rules';
import { buildUfurnishSheetSpec } from './sheet';

/** Accepts the shared input shape too (click targets only), so the module keeps the common contract. */
function toUfurnishInput(input: ModuleInput | UfurnishInput): UfurnishInput {
  const targets = new Map<string, UfurnishTarget>();
  for (const [key, t] of input.targets) {
    targets.set(key, 'target' in t ? t : { start: t.start, end: t.end, target: t.clicks, budgetGbp: null, budgetAud: null, buyingType: null });
  }
  return { rows: input.rows, targets, today: input.today };
}

/**
 * Ufurnish rules v1: billed in £ (CPC £0.23, CPCV £0.04), costs in A$, each campaign's A$ budget from the tracker;
 * IOs "IO", "IO 2", "IO 3" count as one campaign.
 * Self-contained: imports only engine/, shared/ and the common module contract, never another advertiser.
 */
export const ufurnishModule: AdvertiserModule<UfurnishConfig, UfurnishResult> = {
  id: 'ufurnish',
  version: '1.0',
  parseConfig: parseUfurnishConfig,
  calculate: (input: ModuleInput | UfurnishInput, config: UfurnishConfig) => calculateUfurnish(toUfurnishInput(input), config),
  buildSheetSpec: (result, config) => buildUfurnishSheetSpec(result, config),
};

export { calculateUfurnish } from './rules';
export { UFURNISH_DEFAULTS, parseUfurnishConfig } from './config';
export { groupUfurnishCampaigns, parseBuyingType } from './names';
export { UFURNISH_COL, UFURNISH_COLUMNS, UFURNISH_DATA_COLUMNS, UFURNISH_GROUP_KEY_COLUMN, UFURNISH_HEADERS, UFURNISH_LETTER, ufurnishRowValues } from './sheet';
export type { UfurnishColumn } from './sheet';
export type { UfurnishConfig } from './config';
export type { BuyingType } from './names';
export type { UfurnishGroupResult, UfurnishInput, UfurnishResult, UfurnishRow, UfurnishTarget } from './rules';
