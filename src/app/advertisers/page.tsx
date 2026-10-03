'use client';

import { AppShell } from '@/components/AppShell';
import { ButtonLink } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import ui from '@/components/ui.module.css';
import { SEED_ADVERTISERS } from '@/content/advertisers';
import s from './advertisers.module.css';

export default function AdvertisersPage() {
  return (
    <AppShell>
      <div className={s.stack}>
        <PageHeader title="Advertisers" lead="Choose an advertiser, then drop today's DV360 export." backHref="/home/" />
        <div className={`${ui.card} ${s.table}`}>
          <div className={s.inner}>
            <div className={s.head}>
              <div>Advertiser</div>
              <div>Rules module</div>
              <div>Status</div>
              <div />
            </div>
            {SEED_ADVERTISERS.map((a) => (
              <div key={a.id} className={s.row}>
                <div className={s.name}>
                  <span className={s.initials}>{a.name.slice(0, 2).toUpperCase()}</span>
                  {a.name}
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {a.moduleId ? `${a.moduleId} · v2` : '—'}
                </div>
                <div>
                  {a.moduleId ? (
                    <span className={`${ui.pill} ${ui.pillOk}`}>
                      <span className={ui.dot} />
                      Ready
                    </span>
                  ) : (
                    <span className={`${ui.pill} ${ui.pillWarn}`}>
                      <span className={ui.dot} />
                      Waiting for module
                    </span>
                  )}
                </div>
                <div className={s.actions}>
                  {a.moduleId ? (
                    <ButtonLink href={`/advertisers/report/?adv=${encodeURIComponent(a.id)}`} variant="primary" size="small">
                      New report
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Adding, editing and archiving advertisers arrives with the Hub Data sheet (next phase).</p>
      </div>
    </AppShell>
  );
}
