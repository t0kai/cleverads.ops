'use client';

import { AppShell } from '@/components/AppShell';
import { ButtonLink } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import ui from '@/components/ui.module.css';

export default function HistoryPage() {
  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title="History" lead="Sheets you built, newest first." backHref="/home/" />
        <div className={`${ui.card} ${ui.cardPad}`} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No reports yet</div>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 420 }}>Reports appear here with Download and Open sheet buttons once they are built and the Hub Data sheet is connected.</p>
          <ButtonLink href="/advertisers/" variant="primary">
            Build a report
          </ButtonLink>
        </div>
      </div>
    </AppShell>
  );
}
