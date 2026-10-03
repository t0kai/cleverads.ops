import { readDv360Csv, type Dv360Row } from '@/engine/csv/dv360';
import { groupCampaigns } from '@/engine/grouping/groupCampaigns';

export interface UploadCheck {
  readonly rows: readonly Dv360Row[];
  readonly ioCount: number;
  readonly campaignsWithFollowOn: number;
  readonly zeroImpressionIos: readonly string[];
  readonly orphanFollowOns: readonly string[];
  readonly columnsFound: readonly string[];
}

/** Step 1 of buildReport(): read the CSV and report what is in it, before anything touches Google. */
export function checkUpload(csvText: string): UploadCheck {
  const parsed = readDv360Csv(csvText);
  const groups = groupCampaigns(parsed.rows);
  return {
    rows: parsed.rows,
    ioCount: parsed.rows.length,
    campaignsWithFollowOn: groups.filter((g) => g.members.length > 1).length,
    zeroImpressionIos: parsed.rows.filter((r) => r.impressions === 0).map((r) => r.name),
    orphanFollowOns: groups.filter((g) => !g.hasMain).map((g) => g.members[0]?.item.name ?? g.key),
    columnsFound: parsed.columnsFound,
  };
}
