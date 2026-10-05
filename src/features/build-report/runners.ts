import type { ReportSources, TrackerSources } from '@/content/advertisers';
import { ValidationError } from '@/shared/errors';
import type { ReportBuildResult, RunInput } from './runTypes';

/**
 * Advertiser id → its own report builder, settings and labels for the report page.
 * Each entry loads only its own advertiser's code, so a change in one never reaches another.
 * Add one entry per new advertiser module.
 */
export interface ReportRunner {
  readonly label: string;
  readonly version: string;
  /** Shown in the "Rates" box on the report page. */
  readonly rates: readonly { readonly label: string; readonly value: string }[];
  readonly urgentDays: number;
  /** Last build step label, e.g. "Writing Report, Urgent, Margin Issue and Settings tabs". */
  readonly writeLabel: string;
  build(input: RunInput & { readonly sources: TrackerSources }): Promise<ReportBuildResult>;
}

const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
const money = (n: number) => `A$${n.toFixed(2)}`;

function hasTemplate(s: TrackerSources): s is ReportSources {
  return 'templateId' in s && 'templateTab' in s;
}

const loaders: Record<string, () => Promise<ReportRunner>> = {
  acm: async () => {
    const [{ ACM_DEFAULTS }, { buildAcmReport }] = await Promise.all([import('@/advertisers/acm/config'), import('./buildAcmReport')]);
    const c = ACM_DEFAULTS;
    return {
      label: 'acm',
      version: 'rules v2',
      rates: [
        { label: 'Client CPC', value: money(c.clientCpc) },
        { label: 'Click buffer', value: pct(c.clickBuffer) },
        { label: 'FS service fee', value: pct(c.fsRate) },
        { label: 'Nova fee', value: `${money(c.novaCpm)} CPM` },
        { label: 'Minimum margin', value: pct(c.minMargin) },
        { label: 'Urgent window', value: `${c.urgentDays} days` },
        { label: 'CTR range', value: `${pct(c.ctrLow)}–${pct(c.ctrHigh)}` },
      ],
      urgentDays: c.urgentDays,
      writeLabel: 'Writing Report, Urgent, Margin Issue and Formula tabs',
      build: ({ sources, ...run }) => {
        if (!hasTemplate(sources)) throw new ValidationError('ACM needs its Formula template sheet.', [], 'Tell the developer: the ACM template is missing.');
        return buildAcmReport({ ...run, sources, config: c });
      },
    };
  },
  pinstripe: async () => {
    const [{ PINSTRIPE_DEFAULTS }, { buildPinstripeReport }] = await Promise.all([import('@/advertisers/pinstripe/config'), import('./pinstripe/buildPinstripeReport')]);
    const c = PINSTRIPE_DEFAULTS;
    return {
      label: 'pinstripe',
      version: 'rules v1',
      rates: [
        { label: 'Client CPC', value: money(c.clientCpc) },
        { label: 'Impression campaigns', value: `target ≥ ${c.impressionTargetFrom.toLocaleString('en-AU')}` },
        { label: 'Impression budget', value: 'from the tracker' },
        { label: 'Target buffer', value: pct(c.targetBuffer) },
        { label: 'FS service fee', value: pct(c.fsRate) },
        { label: 'Nova fee', value: `${money(c.novaCpm)} CPM` },
        { label: 'Minimum margin', value: pct(c.minMargin) },
        { label: 'Urgent window', value: `${c.urgentDays} days` },
        { label: 'CTR range', value: `${pct(c.ctrLow)}–${pct(c.ctrHigh)}` },
      ],
      urgentDays: c.urgentDays,
      writeLabel: 'Writing Report, Urgent, Margin Issue and Settings tabs',
      build: ({ sources, ...run }) => buildPinstripeReport({ ...run, sources, config: c }),
    };
  },
};

export async function loadRunner(moduleId: string | null): Promise<ReportRunner | null> {
  const load = moduleId ? loaders[moduleId] : undefined;
  return load ? load() : null;
}
