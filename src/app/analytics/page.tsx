'use client';

import { AppShell } from '@/components/AppShell';
import { AnalyticsView } from '@/features/analytics/AnalyticsView';

export default function AnalyticsPage() {
  return (
    <AppShell>
      <AnalyticsView />
    </AppShell>
  );
}
