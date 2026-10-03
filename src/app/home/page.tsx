'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Clock } from '@/components/Clock';
import { Icon } from '@/components/Icon';
import ui from '@/components/ui.module.css';
import { SEED_ADVERTISERS } from '@/content/advertisers';
import { COMING_SOON } from '@/content/tools';
import { useAuth } from '@/features/auth/AuthProvider';
import { clockFace } from '@/features/clock/time';
import { getAppConfig } from '@/shared/config';
import s from './home.module.css';

const TILES = [
  {
    href: '/advertisers/',
    icon: 'list' as const,
    title: 'Advertisers & reports',
    text: "Pick an advertiser, upload today's DV360 export and build the optimization sheet.",
    link: 'Open advertisers →',
    color: '#1A35A8',
    bg: 'linear-gradient(160deg, #FFFFFF 0%, #F3F6FF 100%)',
    border: '#DCE3F7',
    iconBg: 'var(--brand-gradient)',
    delay: '0s',
  },
  {
    href: '/history/',
    icon: 'clock' as const,
    title: 'History',
    text: 'Every sheet built so far, with links to open or download it again.',
    link: 'See history →',
    color: '#137333',
    bg: 'linear-gradient(160deg, #FFFFFF 0%, #F1FAF4 100%)',
    border: '#D5EBDD',
    iconBg: 'var(--sheets)',
    delay: '-1.6s',
  },
  {
    href: '/guide/',
    icon: 'book' as const,
    title: 'User guide & help',
    text: 'Step-by-step how-tos, common fixes, and a direct line to the developer.',
    link: 'Read the guide →',
    color: '#A15C07',
    bg: 'linear-gradient(160deg, #FFFFFF 0%, #FFF8EC 100%)',
    border: '#F1E2C6',
    iconBg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    delay: '-3.2s',
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const { defaultTimeZone } = getAppConfig();
  const [today, setToday] = useState('');
  useEffect(() => setToday(clockFace(new Date(), defaultTimeZone).longDate), [defaultTimeZone]);
  const firstName = user?.name.split(' ')[0] ?? '';
  const ready = SEED_ADVERTISERS.filter((a) => a.moduleId).length;

  return (
    <AppShell>
      <div className={s.stack}>
        <div className={s.heroWrap}>
          <Clock defaultZone={defaultTimeZone} />
          <section className={s.hero}>
            <div className={s.heroBlob} style={{ width: 340, height: 340, right: -90, top: -140, background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)' }} />
            <div className={s.heroBlob} style={{ width: 280, height: 280, left: '38%', bottom: -170, background: 'radial-gradient(circle, rgba(125,211,252,0.30) 0%, rgba(125,211,252,0) 70%)', animationDuration: '18s', animationDirection: 'reverse' }} />
            <div className={s.heroText}>
              <div className={s.greet}>
                Good to see you{firstName ? `, ${firstName}` : ''}
                {today ? ` · ${today}` : ''}
              </div>
              <h1 className={s.title}>Welcome to CleverAds Operations</h1>
              <p className={s.lead}>
                One place for the team&apos;s daily campaign work: build optimization sheets from DV360, keep pacing and margin in check, and keep every
                advertiser&apos;s rules in one place. More dashboards and research tools will join here over time.
              </p>
              <div className={s.badges}>
                <span className={s.badge}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
                  </svg>
                  For authorised CleverAds staff only
                </span>
                <span className={s.badge}>Activity is logged per user</span>
              </div>
            </div>
          </section>
        </div>

        <div>
          <h2 className={s.section}>Start here</h2>
          <div className={s.tiles}>
            {TILES.map((t) => (
              <Link key={t.href} href={t.href} className={s.tile} style={{ background: t.bg, border: `1px solid ${t.border}`, boxShadow: '0 12px 28px rgba(36,71,214,0.10)', animationDelay: t.delay }}>
                <span className={s.tileIcon} style={{ background: t.iconBg }}>
                  <Icon name={t.icon} color="#fff" size={22} />
                </span>
                <span className={s.tileTitle}>{t.title}</span>
                <span className={s.tileText}>{t.text}</span>
                <span className={s.tileLink} style={{ color: t.color }}>
                  {t.link}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className={s.stats}>
          <div className={`${ui.card} ${s.statCard}`}>
            <div className={ui.statLabel}>Advertisers</div>
            <div className={ui.statValue}>{SEED_ADVERTISERS.length}</div>
            <div style={{ fontSize: 12, color: 'var(--ok-ink)' }}>{ready} ready for reports</div>
          </div>
          <div className={`${ui.card} ${s.statCard}`}>
            <div className={ui.statLabel}>Last report</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>—</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Shown here once History is connected</div>
          </div>
          <div className={`${ui.card} ${s.statCard}`}>
            <div className={ui.statLabel}>Needs attention</div>
            <div className={ui.statValue}>—</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>IOs below the minimum margin</div>
          </div>
        </div>

        <div>
          <h2 className={s.section}>More tools · coming soon</h2>
          <div className={s.tiles}>
            {COMING_SOON.map((t) => (
              <div key={t.name} className={s.soon}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EEF1F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name="chart" color="#8A9099" />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 auto' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{t.text}</span>
                </span>
                <span className={s.soonTag}>Soon</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
