'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ui from '@/components/ui.module.css';
import {
  ANALYTICS_FIXES,
  ANALYTICS_MAP,
  ANALYTICS_PARTS,
  ANALYTICS_TASKS,
  ANALYTICS_WORDS,
  ROW_CHECKS,
  UPDATE_STEPS,
  type GuidePart,
} from '@/content/analyticsGuide';
import s from './analyticsGuide.module.css';

interface Shot {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

const MAP_SHOT: Shot = {
  src: '/guide/analytics/map.webp',
  alt: 'The whole Performance Analytics page with its parts numbered 1 to 9.',
  width: 1100,
  height: 2570,
};

const PHONE_SHOT: Shot = {
  src: '/guide/analytics/phone.webp',
  alt: 'Performance Analytics on a phone: the filters stack and the tables become cards.',
  width: 585,
  height: 1266,
};

const TOC = [
  { id: 'ag-start', label: 'Quick start' },
  { id: 'ag-map', label: 'Page map' },
  { id: 'ag-parts', label: 'Part by part' },
  { id: 'ag-tasks', label: 'How do I…?' },
  { id: 'ag-update', label: 'Updating the data' },
  { id: 'ag-words', label: 'Words used' },
  { id: 'ag-phone', label: 'On a phone' },
  { id: 'ag-fixes', label: 'If something goes wrong' },
] as const;

const QUICK = [
  { title: 'Open the page', text: 'Left menu › Performance Analytics.' },
  { title: 'Pick the advertiser', text: 'Or keep All advertisers for the total.' },
  { title: 'Set the months', text: 'From and To. Everything updates at once.' },
  { title: 'Read and dig in', text: 'Headline numbers first, then Compare, Clients or the Campaign log.' },
] as const;

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  // Move keyboard focus too, so screen reader and keyboard users land on the section.
  el.focus({ preventScroll: true });
}

function ZoomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={up ? '#1A35A8' : '#5B616B'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden="true">
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

function TipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A35A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 2 }} aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
    </svg>
  );
}

/** A screenshot that opens full size when clicked. */
function Screenshot({ shot, onOpen, className }: { shot: Shot; onOpen: (shot: Shot) => void; className?: string }) {
  return (
    <button type="button" className={`${s.shot} ${className ?? ''}`} onClick={() => onOpen(shot)} aria-label={`Enlarge: ${shot.alt}`}>
      <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" />
      <span className={s.zoom}>
        <ZoomIcon /> Click to enlarge
      </span>
    </button>
  );
}

function Lightbox({ shot, onClose }: { shot: Shot; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [onClose]);
  return (
    <div className={s.lightbox} role="dialog" aria-modal="true" aria-label={shot.alt} onClick={onClose}>
      <div className={s.lightboxBar} onClick={(e) => e.stopPropagation()}>
        <span>{shot.alt}</span>
        <button ref={closeRef} type="button" className={s.closeBtn} onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <div className={s.lightboxBody}>
        <img src={shot.src} alt="" width={shot.width} height={shot.height} data-wide={shot.width > shot.height ? '' : undefined} onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
}

function SectionHead({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <div className={s.sectionHead}>
      <span className={s.kicker}>{kicker}</span>
      <h2 className={s.h2}>{title}</h2>
      {lead ? <p className={s.lead}>{lead}</p> : null}
    </div>
  );
}

function PartCard({ part, index, onOpen }: { part: GuidePart; index: number; onOpen: (shot: Shot) => void }) {
  return (
    <article id={part.id} tabIndex={-1} className={`${ui.card} ${s.part}`} aria-labelledby={`${part.id}-t`}>
      <header className={s.partHead}>
        <span className={s.partNo}>{index + 1}</span>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h3 id={`${part.id}-t`} className={s.h3}>
            {part.title}
          </h3>
          <p className={s.shows}>{part.shows}</p>
        </div>
        <span className={s.mapTag} title="Where this part is on the page map">
          Map <b>{part.mapNo}</b>
        </span>
      </header>

      <Screenshot shot={{ src: part.image, alt: part.imageAlt, width: part.width, height: part.height }} onOpen={onOpen} />

      <div className={s.partBody}>
        <div className={s.howLabel}>How to use it — numbers match the screenshot</div>
        <ol className={s.steps}>
          {part.steps.map((step, i) => (
            <li key={step.label}>
              <span className={s.marker} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <b>{step.label}</b>
                <span className={s.stepText}>{step.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <div className={s.tip}>
          <TipIcon />
          <span>{part.tip}</span>
        </div>
      </div>
    </article>
  );
}

function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string>(ids[0] ?? '');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const TOC_IDS = TOC.map((t) => t.id);

/** The Performance Analytics tab of the user guide. `contact` is the Contact the developer form. */
export function AnalyticsGuide({ contact }: { contact: ReactNode }) {
  const [shot, setShot] = useState<Shot | null>(null);
  const [openTask, setOpenTask] = useState<string>(ANALYTICS_TASKS[0]?.key ?? '');
  const close = useCallback(() => setShot(null), []);
  const active = useActiveSection(TOC_IDS);

  return (
    <div className={s.wrap}>
      <div className={s.main}>
        {/* Quick start */}
        <section id="ag-start" tabIndex={-1} className={`${ui.card} ${s.hero}`}>
          <div className={s.heroTop}>
            <div>
              <span className={s.kicker}>Performance Analytics</span>
              <h2 className={s.h2}>DV360 cost and rates, month by month</h2>
              <p className={s.lead}>See what each advertiser spent, what they paid per 1,000 impressions (eCPM) and per click (eCPC), and how that changed over time. The numbers come from the CleverAds Performance Data sheet, updated once a month.</p>
            </div>
            <Link href="/analytics/" className={`${ui.btn} ${ui.primary}`}>
              Open Performance Analytics
            </Link>
          </div>
          <div className={s.quickGrid}>
            {QUICK.map((q, i) => (
              <div key={q.title} className={s.quickItem}>
                <span className={s.num}>{i + 1}</span>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{q.title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{q.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Page map */}
        <section id="ag-map" tabIndex={-1} className={`${ui.card} ${s.block}`}>
          <SectionHead kicker="Start here" title="Page map: which part shows what" lead="The whole page from top to bottom. Click a part in the list to jump to its instructions, or click the picture to see it full size." />
          <div className={s.mapGrid}>
            <Screenshot shot={MAP_SHOT} onOpen={setShot} className={s.mapShot} />
            <ol className={s.legend}>
              {ANALYTICS_MAP.map((m) => (
                <li key={m.no}>
                  <button type="button" className={s.legendBtn} onClick={() => jump(m.target)}>
                    <span className={s.marker} aria-hidden="true">
                      {m.no}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className={s.legendTitle}>{m.title}</span>
                      <span className={s.legendText}>{m.text}</span>
                    </span>
                    <span className={s.legendGo} aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              ))}
              <li className={s.legendNote}>
                Pick one advertiser and a <b>Month by month</b> table also appears, just above the Campaign log.
              </li>
            </ol>
          </div>
        </section>

        {/* Part by part */}
        <section id="ag-parts" tabIndex={-1} className={s.partsWrap}>
          <SectionHead kicker="Part by part" title="What each part shows and how to use it" lead="Each screenshot has numbered markers. The steps under it use the same numbers." />
          <nav className={s.chips} aria-label="Parts of the page">
            {ANALYTICS_PARTS.map((p) => (
              <button key={p.id} type="button" className={s.chip} onClick={() => jump(p.id)}>
                {p.title}
              </button>
            ))}
          </nav>
          {ANALYTICS_PARTS.map((p, i) => (
            <PartCard key={p.id} part={p} index={i} onOpen={setShot} />
          ))}
        </section>

        {/* Tasks */}
        <section id="ag-tasks" tabIndex={-1} className={`${ui.card}`} style={{ overflow: 'hidden' }}>
          <div className={s.block} style={{ paddingBottom: 8 }}>
            <SectionHead kicker="Common jobs" title="How do I…?" lead="Click a question to see the clicks." />
          </div>
          {ANALYTICS_TASKS.map((t, i) => {
            const isOpen = openTask === t.key;
            return (
              <div key={t.key} className={s.topic}>
                <button type="button" className={s.topicBtn} aria-expanded={isOpen} aria-controls={`task-${t.key}`} onClick={() => setOpenTask(isOpen ? '' : t.key)}>
                  <span className={s.topicNo}>{i + 1}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, flex: '1 1 auto', minWidth: 0 }}>{t.title}</span>
                  <Chevron up={isOpen} />
                </button>
                {isOpen ? (
                  <div id={`task-${t.key}`} className={s.topicBody}>
                    <ol>
                      {t.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        {/* Updating */}
        <section id="ag-update" tabIndex={-1} className={`${ui.card} ${s.block}`}>
          <SectionHead kicker="Once a month" title="Updating the data" lead="The page reads the Data tab of the CleverAds Performance Data sheet in Google Drive. Add each new month there; nothing needs to change in the app." />
          <ol className={s.updateGrid}>
            {UPDATE_STEPS.map((u, i) => (
              <li key={u.title} className={s.updateItem}>
                <span className={s.num}>{i + 1}</span>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{u.text}</div>
              </li>
            ))}
          </ol>
          <h3 className={s.h3} style={{ marginTop: 22 }}>
            If the Row check column says…
          </h3>
          <div className={s.checkTable} role="table" aria-label="Row check messages">
            {ROW_CHECKS.map((r) => (
              <div key={r.value} className={s.checkRow} role="row">
                <span role="cell">
                  <span className={`${s.pill} ${s[r.kind]}`}>{r.value}</span>
                </span>
                <span role="cell" className={s.checkText}>
                  {r.meaning}
                </span>
              </div>
            ))}
          </div>
          <div className={s.tip} style={{ marginTop: 14 }}>
            <TipIcon />
            <span>The sheet&apos;s own How to update tab has the same steps, plus the latest month in the sheet and the next month to add.</span>
          </div>
        </section>

        {/* Words */}
        <section id="ag-words" tabIndex={-1} className={`${ui.card} ${s.block}`}>
          <SectionHead kicker="Glossary" title="Words used on the page" />
          <dl className={s.words}>
            {ANALYTICS_WORDS.map((w) => (
              <div key={w.word} className={s.word}>
                <dt>{w.word}</dt>
                <dd>{w.meaning}</dd>
              </div>
            ))}
          </dl>
          <div className={s.legendKey}>
            <span>
              <span className={`${s.pill} ${s.ok}`}>▼ 4.2%</span> better
            </span>
            <span>
              <span className={`${s.pill} ${s.bad}`}>▲ 6.8%</span> worse
            </span>
            <span>
              <span className={`${s.pill} ${s.neutral}`}>▲ 12%</span> volume, neither good nor bad
            </span>
          </div>
        </section>

        {/* Phone */}
        <section id="ag-phone" tabIndex={-1} className={`${ui.card} ${s.block}`}>
          <div className={s.phoneGrid}>
            <div>
              <SectionHead kicker="On the go" title="On a phone" lead="The page works the same way on a phone." />
              <ul className={s.bullets}>
                <li>The filters stack one under another at the top.</li>
                <li>Tap a bar or a change pill to see its details (there is no hover on a phone).</li>
                <li>Tables become cards. Use the Sort by list above them to sort.</li>
                <li>Download CSV works too; the file goes to your phone&apos;s downloads.</li>
              </ul>
            </div>
            <Screenshot shot={PHONE_SHOT} onOpen={setShot} className={s.phoneShot} />
          </div>
        </section>

        {/* Fixes + contact */}
        <section id="ag-fixes" tabIndex={-1} className={s.fixLayout}>
          <div className={`${ui.card} ${s.block}`} style={{ flex: '999 1 420px', minWidth: 0 }}>
            <SectionHead kicker="Help" title="If something goes wrong" lead="Most problems are fixed in a minute. If yours isn't here, message the developer." />
            {ANALYTICS_FIXES.map((f) => (
              <div key={f.problem} className={s.fix}>
                <span className={s.fixIcon} aria-hidden="true">
                  !
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{f.problem}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 2 }}>{f.fix}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>{contact}</div>
        </section>
      </div>

      <aside className={s.toc} aria-label="On this page">
        <div className={s.tocTitle}>On this page</div>
        {TOC.map((t) => (
          <button key={t.id} type="button" className={`${s.tocLink} ${active === t.id ? s.tocOn : ''}`} aria-current={active === t.id ? 'location' : undefined} onClick={() => jump(t.id)}>
            {t.label}
          </button>
        ))}
        <Link href="/analytics/" className={s.tocOpen}>
          Open the page →
        </Link>
      </aside>

      {shot ? <Lightbox shot={shot} onClose={close} /> : null}
    </div>
  );
}
