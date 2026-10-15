import type { ReportSources, TrackerSources } from '@/content/advertisers';
import type { Dv360Row } from '@/engine/csv/dv360';
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
  /** For advertisers that name 2nd/3rd IOs their own way: the upload check uses this instead of the general rule. */
  groupCheck?(rows: readonly Dv360Row[]): { readonly campaignsWithFollowOn: number; readonly orphanFollowOns: readonly string[] };
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
      version: 'rules v3',
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
      version: 'rules v2',
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
  timeout: async () => {
    const [{ TIMEOUT_DEFAULTS }, { groupTimeOutCampaigns }, { buildTimeOutReport }] = await Promise.all([
      import('@/advertisers/timeout/config'),
      import('@/advertisers/timeout/names'),
      import('./timeout/buildTimeOutReport'),
    ]);
    const c = TIMEOUT_DEFAULTS;
    return {
      label: 'timeout',
      version: 'rules v2',
      rates: [
        { label: 'Campaign type', value: 'CPC' },
        { label: 'Client CPC', value: money(c.clientCpc) },
        { label: 'Client CPM', value: money(c.clientCpm) },
        { label: 'Click buffer', value: pct(c.clickBuffer) },
        { label: 'FS service fee', value: pct(c.fsRate) },
        { label: 'Nova fee', value: `${money(c.novaCpm)} CPM` },
        { label: 'Minimum margin', value: pct(c.minMargin) },
        { label: 'Urgent window', value: `${c.urgentDays} days` },
        { label: 'CTR range', value: `${pct(c.ctrLow)}–${pct(c.ctrHigh)}` },
      ],
      urgentDays: c.urgentDays,
      writeLabel: 'Writing Report, Urgent, Margin Issue and Settings tabs',
      build: ({ sources, ...run }) => buildTimeOutReport({ ...run, sources, config: c }),
      groupCheck: (rows) => {
        const groups = groupTimeOutCampaigns(rows);
        return {
          campaignsWithFollowOn: groups.filter((g) => g.members.length > 1).length,
          orphanFollowOns: groups.filter((g) => !g.hasMain).map((g) => g.members[0]?.item.name ?? g.key),
        };
      },
    };
  },
  benzinga: async () => {
    const [{ BENZINGA_DEFAULTS }, { groupBenzingaCampaigns }, { buildBenzingaReport }] = await Promise.all([
      import('@/advertisers/benzinga/config'),
      import('@/advertisers/benzinga/names'),
      import('./benzinga/buildBenzingaReport'),
    ]);
    const c = BENZINGA_DEFAULTS;
    return {
      label: 'benzinga',
      version: 'rules v1',
      rates: [
        { label: 'Billing currency', value: 'US$ (costs in A$)' },
        { label: 'Client CPC', value: `US$${c.clientCpcUsd.toFixed(2)}` },
        { label: 'CPM budget', value: 'from the tracker (US$)' },
        { label: 'USD → AUD', value: "each campaign's tracker rate" },
        { label: 'Target buffer', value: pct(c.targetBuffer) },
        { label: 'DV360/FS fee', value: `${+(c.fsRate * 100).toFixed(2)}%` },
        { label: 'Nova fee', value: `${money(c.novaCpm)} CPM` },
        { label: 'Minimum margin', value: pct(c.minMargin) },
        { label: 'Urgent window', value: `${c.urgentDays} days` },
        { label: 'CTR range', value: `${pct(c.ctrLow)}–${pct(c.ctrHigh)}` },
      ],
      urgentDays: c.urgentDays,
      writeLabel: 'Writing Report, Urgent, Margin Issue and Settings tabs',
      build: ({ sources, ...run }) => buildBenzingaReport({ ...run, sources, config: c }),
      // Benzinga names follow-on IOs "#2 … #N", not "2nd"/"3rd"; every IO belongs to some campaign.
      groupCheck: (rows) => ({
        campaignsWithFollowOn: groupBenzingaCampaigns(rows).filter((g) => g.members.length > 1).length,
        orphanFollowOns: [],
      }),
    };
  },
};

export async function loadRunner(moduleId: string | null): Promise<ReportRunner | null> {
  const load = moduleId ? loaders[moduleId] : undefined;
  return load ? load() : null;
}
