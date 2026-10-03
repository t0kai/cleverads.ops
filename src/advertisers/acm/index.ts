import type { AdvertiserModule } from '../types';
import { parseAcmConfig, type AcmConfig } from './config';
import { calculateAcm, type AcmResult } from './rules';
import { buildAcmSheetSpec } from './sheet';

/** ACM rules v2: CPC billing, 2nd/3rd IO grouping, projected margin. */
export const acmModule: AdvertiserModule<AcmConfig, AcmResult> = {
  id: 'acm',
  version: '2.0',
  parseConfig: parseAcmConfig,
  calculate: calculateAcm,
  buildSheetSpec: (result, config) => buildAcmSheetSpec(result, config),
};

export type { AcmConfig } from './config';
export type { AcmResult, AcmRow, AcmGroupResult } from './rules';
