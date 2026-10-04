'use client';

import { useEffect, useState } from 'react';
import { sendMail } from '@/adapters/gmail/sendMail';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';
import ui from '@/components/ui.module.css';
import { SEED_ADVERTISERS } from '@/content/advertisers';
import { FIXES, GUIDE_TOPICS, PROBLEM_TYPES, QUICK_START } from '@/content/guide';
import { useAuth } from '@/features/auth/AuthProvider';
import { AnalyticsGuide } from '@/features/guide/AnalyticsGuide';
import { MAX_MESSAGE_LENGTH, composeDeveloperMessage } from '@/features/contact-developer/composeMessage';
import { getAppConfig } from '@/shared/config';
import { toAppError, type AppError } from '@/shared/errors';
import s from './guide.module.css';

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={up ? '#1A35A8' : '#5B616B'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden="true">
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

function ContactForm() {
  const { user, demo, getAccessToken } = useAuth();
  const [advertiser, setAdvertiser] = useState(SEED_ADVERTISERS[0]?.name ?? 'Not about one advertiser');
  const [problem, setProblem] = useState<string>(PROBLEM_TYPES[0]);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const send = async () => {
    if (!text.trim()) {
      setMissing(true);
      return;
    }
    setError(null);
    setState('sending');
    try {
      const mail = composeDeveloperMessage({ fromEmail: user?.email ?? '', fromName: user?.name ?? '', advertiser, problemType: problem, text });
      if (!demo) {
        await sendMail(await getAccessToken(), { to: getAppConfig().developerEmail, subject: mail.subject, text: mail.text, replyTo: user?.email ?? '' });
      }
      setState('sent');
    } catch (e) {
      setError(toAppError(e));
      setState('idle');
    }
  };

  return (
    <section className={ui.card} style={{ overflow: 'hidden' }}>
      <div className={s.contactHead}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Contact the developer</div>
          <div style={{ fontSize: 13, color: '#E3E7FF', lineHeight: 1.5, marginTop: 2 }}>Describe the problem. It goes straight to the developer, and the reply comes to your email.</div>
        </div>
      </div>
      {state === 'sent' ? (
        <div role="status" className={s.sent}>
          <div style={{ width: 52, height: 52, borderRadius: 999, background: 'var(--ok-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{demo ? 'Message ready (preview mode)' : 'Message sent'}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>The developer will reply to {user?.email}.</div>
          <Button
            onClick={() => {
              setText('');
              setState('idle');
            }}
          >
            Write another message
          </Button>
        </div>
      ) : (
        <div className={s.form}>
          <div className={s.field}>
            <label htmlFor="c-adv">Advertiser</label>
            <select id="c-adv" className={s.input} value={advertiser} onChange={(e) => setAdvertiser(e.target.value)}>
              {SEED_ADVERTISERS.map((a) => (
                <option key={a.id}>{a.name}</option>
              ))}
              <option>Not about one advertiser</option>
            </select>
          </div>
          <div className={s.field}>
            <label htmlFor="c-type">What kind of problem?</label>
            <select id="c-type" className={s.input} value={problem} onChange={(e) => setProblem(e.target.value)}>
              {PROBLEM_TYPES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className={s.field}>
            <label htmlFor="c-msg">What happened?</label>
            <textarea
              id="c-msg"
              rows={5}
              maxLength={MAX_MESSAGE_LENGTH}
              className={s.textarea}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMissing(false);
              }}
              placeholder="What you clicked, what you expected, and what you saw. Paste any error message."
            />
            {missing ? (
              <div role="alert" style={{ fontSize: 12, color: 'var(--bad)' }}>
                Please describe the problem first.
              </div>
            ) : null}
          </div>
          {error ? (
            <Notice kind="bad" title={error.userMessage}>
              <div>{error.action}</div>
            </Notice>
          ) : null}
          <Button variant="primary" full size="large" onClick={() => void send()} disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send to developer'}
          </Button>
        </div>
      )}
    </section>
  );
}

type Tab = 'reports' | 'analytics';

const TABS: readonly { key: Tab; label: string; sub: string; hash: string }[] = [
  { key: 'reports', label: 'Optimization reports', sub: 'Reports, ad types, advertisers', hash: '' },
  { key: 'analytics', label: 'Performance Analytics', sub: 'Every part of the page, step by step', hash: '#analytics' },
];

function TabIcon({ tab }: { tab: Tab }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {tab === 'reports' ? (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      ) : (
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      )}
    </svg>
  );
}

export default function GuidePage() {
  const [open, setOpen] = useState<string>('report');
  const [tab, setTab] = useState<Tab>('reports');

  // The tab lives in the address (#analytics), so links from other pages open the right one.
  useEffect(() => {
    const read = () => setTab(window.location.hash === '#analytics' ? 'analytics' : 'reports');
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const choose = (next: Tab) => {
    setTab(next);
    const hash = TABS.find((t) => t.key === next)?.hash ?? '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  };

  return (
    <AppShell>
      <div className={s.stack}>
        <PageHeader title="User guide" lead="Step-by-step help for every part of CleverAds Operations. Pick a topic below." backHref="/home/" />

        <div className={s.tabs} role="tablist" aria-label="Guide topics">
          {TABS.map((t) => (
            <button
              key={t.key}
              id={`tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`}
              onClick={() => choose(t.key)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const next = TABS[(TABS.findIndex((x) => x.key === t.key) + 1) % TABS.length];
                  if (next) {
                    choose(next.key);
                    document.getElementById(`tab-${next.key}`)?.focus();
                  }
                }
              }}
            >
              <span className={s.tabIcon}>
                <TabIcon tab={t.key} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span className={s.tabLabel}>{t.label}</span>
                <span className={s.tabSub}>{t.sub}</span>
              </span>
            </button>
          ))}
        </div>

        {tab === 'analytics' ? (
          <div id="panel-analytics" role="tabpanel" aria-labelledby="tab-analytics">
            <AnalyticsGuide contact={<ContactForm />} />
          </div>
        ) : (
          <div id="panel-reports" role="tabpanel" aria-labelledby="tab-reports" className={s.stack}>
          <section className={`${ui.card} ${s.quick}`}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Quick start: today&apos;s report in 4 steps</h2>
            <div className={s.quickGrid}>
              {QUICK_START.map((q, i) => (
                <div key={q.title} className={s.quickItem}>
                  <span className={s.num}>{i + 1}</span>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{q.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{q.text}</div>
                </div>
              ))}
            </div>
          </section>

          <div className={s.layout}>
            <div className={s.left}>
              <section className={ui.card} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px 12px' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>How to</h2>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Click a topic to open its steps.</div>
                </div>
                {GUIDE_TOPICS.map((t, i) => {
                  const isOpen = open === t.key;
                  return (
                    <div key={t.key} className={s.topic}>
                      <button type="button" className={s.topicBtn} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : t.key)}>
                        <span className={s.topicNo}>{i + 1}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 auto', minWidth: 0 }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</span>
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t.sub}</span>
                        </span>
                        <Chevron up={isOpen} />
                      </button>
                      {isOpen ? (
                        <div className={s.topicBody}>
                          <ol>
                            {t.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                          <div className={s.tip}>{t.tip}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>

              <section className={`${ui.card}`} style={{ padding: '20px 24px' }}>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>If something goes wrong</h2>
                <div style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 8px' }}>Most problems are fixed in a minute. If yours isn&apos;t here, message the developer.</div>
                {FIXES.map((f) => (
                  <div key={f.problem} className={s.fix}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--warn-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warn)', fontWeight: 700 }}>!</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{f.problem}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 2 }}>{f.fix}</div>
                    </div>
                  </div>
                ))}
              </section>
            </div>
            <aside className={s.right}>
              <ContactForm />
            </aside>
          </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
