import type { AdvertiserModule, ModuleInput } from '../types';
import { parsePinstripeConfig, type PinstripeConfig } from './config';
import { calculatePinstripe, type PinstripeInput, type PinstripeResult, type PinstripeTarget } from './rules';
import { buildPinstripeSheetSpec } from './sheet';

/** Accepts the shared input shape too (targets without budgets), so the module keeps the common contract. */
function toPinstripeInput(input: ModuleInput | PinstripeInput): PinstripeInput {
  const targets = new Map<string, PinstripeTarget>();
  for (const [key, t] of input.targets) {
    targets.set(key, 'target' in t ? t : { start: t.start, end: t.end, target: t.clicks, budget: null });
  }
  return { rows: input.rows, targets, today: input.today };
}

/**
 * Pinstripe (Private Media Operations) rules v1: click campaigns billed per click (A$0.40),
 * impression campaigns use the budget typed into the tracker; 2nd/3rd IO grouping; projected margin.
 * Self-contained: imports only engine/, shared/ and the common module contract, never another advertiser.
 */
export const pinstripeModule: AdvertiserModule<PinstripeConfig, PinstripeResult> = {
  id: 'pinstripe',
  version: '1.0',
  parseConfig: parsePinstripeConfig,
  calculate: (input: ModuleInput | PinstripeInput, config: PinstripeConfig) => calculatePinstripe(toPinstripeInput(input), config),
  buildSheetSpec: (result, config) => buildPinstripeSheetSpec(result, config),
};

export { calculatePinstripe } from './rules';
export { PINSTRIPE_DEFAULTS, parsePinstripeConfig } from './config';
export { PINSTRIPE_DATA_COLUMNS, PINSTRIPE_GROUP_KEY_COLUMN, PINSTRIPE_HEADERS } from './sheet';
export type { PinstripeConfig } from './config';
export type { CampaignType, PinstripeGroupResult, PinstripeInput, PinstripeResult, PinstripeRow, PinstripeTarget } from './rules';
