import type { AdvertiserModule, ModuleInput } from '../types';
import { parseTimeOutConfig, type TimeOutConfig } from './config';
import { calculateTimeOut, type TimeOutResult } from './rules';
import { buildTimeOutSheetSpec } from './sheet';

/**
 * Time Out rules v1: every campaign billed per click (A$0.30) for now, healthy CTR 1.5–3%,
 * "2nd IO 3rd" naming, Required Clicks / Day, projected margin.
 * Self-contained: imports only engine/, shared/ and the common module contract, never another advertiser.
 */
export const timeOutModule: AdvertiserModule<TimeOutConfig, TimeOutResult> = {
  id: 'timeout',
  version: '1.0',
  parseConfig: parseTimeOutConfig,
  calculate: (input: ModuleInput, config: TimeOutConfig) => calculateTimeOut(input, config),
  buildSheetSpec: (result, config) => buildTimeOutSheetSpec(result, config),
};

export { calculateTimeOut, requiredPerDay } from './rules';
export { TIMEOUT_CAMPAIGN_TYPE, TIMEOUT_DEFAULTS, parseTimeOutConfig } from './config';
export { groupTimeOutCampaigns, splitTimeOutName } from './names';
export { TIMEOUT_DATA_COLUMNS, TIMEOUT_GROUP_KEY_COLUMN, TIMEOUT_HEADERS } from './sheet';
export type { TimeOutConfig } from './config';
export type { TimeOutGroupResult, TimeOutInput, TimeOutResult, TimeOutRow, TimeOutTarget } from './rules';
