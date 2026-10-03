'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type DragEvent } from 'react';
import { ACM_DEFAULTS } from '@/advertisers/acm/config';
import { AppShell } from '@/components/AppShell';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import ui from '@/components/ui.module.css';
import { SEED_ADVERTISERS } from '@/content/advertisers';
import { useAuth } from '@/features/auth/AuthProvider';
import { buildAcmReport, type BuildResult, type BuildStep } from '@/features/build-report/buildAcmReport';
import { checkUpload, type UploadCheck } from '@/features/build-report/checkUpload';
import { getAppConfig } from '@/shared/config';
import { AccessError, ValidationError, toAppError, type AppError } from '@/shared/errors';
import s from './report.module.css';

const MAX_BYTES = 10 * 1024 * 1024;
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const STEPS: { id: BuildStep; label: string }[] = [
  { id: 'targets', label: 'Reading targets from the Campaign Tracker' },
  { id: 'calculate', label: 'Calculating every insertion order' },
  { id: 'create', label: 'Creating the sheet in the Results folder' },
  { id: 'write', label: 'Writing Report, Urgent, Margin Issue and Formula tabs' },
];

function Tick({ warn }: { warn?: boolean }) {
  return warn ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A15C07" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true">
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

/** Green badge with a tick that draws itself once. */
function SuccessBadge() {
  return (
    <span className={s.badge} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path className={s.badgeTick} d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function StepIcon({ state }: { state: 'done' | 'active' | 'todo' }) {
  if (state === 'done') {
    return (
      <span className={`${s.stepIcon} ${s.stepDone}`} aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  }
  return <span className={`${s.stepIcon} ${state === 'active' ? s.stepActive : s.stepTodo}`} aria-hidden="true" />;
}

function ReportBuilder() {
  const params = useSearchParams();
  const { user, demo, googleReady, getAccessToken } = useAuth();
  const adv = SEED_ADVERTISERS.find((a) => a.id === params.get('adv')) ?? null;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; bytes: number } | null>(null);
  const [check, setCheck] = useState<UploadCheck | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [over, setOver] = useState(false);
  const [step, setStep] = useState<BuildStep | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<AppError | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);

  const read = async (f: File) => {
    setError(null);
    setCheck(null);
    setResult(null);
    setBuildError(null);
    setStep(null);
    setFile({ name: f.name, bytes: f.size });
    try {
      if (!f.name.toLowerCase().endsWith('.csv')) throw new ValidationError('That is not a CSV file.', ['Choose the .csv you downloaded from DV360.']);
      if (f.size > MAX_BYTES) throw new ValidationError('The file is larger than 10 MB.', ['Export only this advertiser’s insertion orders.']);
      setCheck(checkUpload(await f.text()));
    } catch (e) {
      setError(toAppError(e));
    } finally {
      if (input.current) input.current.value = ''; // choosing the same file again still triggers a read
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void read(f);
  };

  const build = async () => {
    if (!check || !adv?.sources || building) return;
    setBuilding(true);
    setBuildError(null);
    setResult(null);
    try {
      const token = await getAccessToken();
      const res = await buildAcmReport({
        token,
        rows: check.rows,
        sources: adv.sources,
        config: ACM_DEFAULTS,
        reportTimeZone: getAppConfig().reportTimeZone,
        onStep: setStep,
      });
      setResult(res);
    } catch (e) {
      setBuildError(toAppError(e));
    } finally {
      setBuilding(false);
    }
  };

  if (!adv) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <BackButton href="/advertisers/" />
        <Notice kind="warn" title="Advertiser not found.">
          <div>Go back to Advertisers and choose one from the list.</div>
        </Notice>
      </div>
    );
  }

  const c = ACM_DEFAULTS;
  const canBuild = Boolean(check && adv.sources && user && !demo && googleReady);
  const activeIndex = step ? STEPS.findIndex((x) => x.id === step) : -1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
          <BackButton href="/advertisers/" />
          <span>Advertisers / {adv.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1 className={ui.pageTitle}>{adv.name}</h1>
          <span className={`${ui.pill} mono`} style={{ background: 'var(--tint-brand)', color: 'var(--brand-strong)' }}>
            {adv.moduleId} · rules v2
          </span>
        </div>
      </div>

      <div className={s.layout}>
        <div className={s.main}>
          <section className={`${ui.card} ${ui.cardPad}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={s.step}>
              <span className={s.stepNo}>1</span>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Upload the DV360 export</h2>
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
            {!check ? (
              <div
                className={`${s.drop} ${over ? s.dropOver : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5B616B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 15V4" />
                  <path d="M7 8l5-5 5 5" />
                  <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                </svg>
                <div style={{ fontSize: 16, fontWeight: 500 }}>Drag the CSV here</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>DV360 › Insertion orders › Download (.csv)</div>
                <Button onClick={() => input.current?.click()}>Browse files</Button>
              </div>
            ) : (
              <div className={s.success} role="status" aria-live="polite">
                <SuccessBadge />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className={s.successTitle}>Upload complete</div>
                  <div className={s.successMeta}>
                    <span className="mono" title={file?.name}>
                      {file?.name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{check.ioCount} insertion orders</span>
                    {file ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{size(file.bytes)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <Button size="small" onClick={() => input.current?.click()} disabled={building}>
                  Replace
                </Button>
              </div>
            )}
            {error ? (
              <Notice kind="bad" title={error.userMessage} items={error instanceof ValidationError ? error.issues : []}>
                <div>{error.action}</div>
              </Notice>
            ) : null}
          </section>

          {check ? (
            <section className={`${ui.card} ${ui.cardPad}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={s.step}>
                <span className={s.stepNo}>2</span>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>Check before building</h2>
              </div>
              <div className={s.stats}>
                <div className={ui.stat}>
                  <div className={ui.statValue}>{check.ioCount}</div>
                  <div className={ui.statLabel}>Insertion orders</div>
                </div>
                <div className={ui.stat}>
                  <div className={ui.statValue}>{check.campaignsWithFollowOn}</div>
                  <div className={ui.statLabel}>Campaigns with a 2nd IO</div>
                </div>
                <div className={ui.stat}>
                  <div className={ui.statValue}>{check.zeroImpressionIos.length}</div>
                  <div className={ui.statLabel}>IOs with 0 impressions</div>
                </div>
              </div>
              <ul className={s.checks}>
                <li>
                  <Tick />
                  <span>Columns found: {check.columnsFound.map((x) => x[0]?.toUpperCase() + x.slice(1)).join(', ')}</span>
                </li>
                {check.orphanFollowOns.length ? (
                  <li>
                    <Tick warn />
                    <span>2nd IO without its main campaign in the file: {check.orphanFollowOns.join('; ')}</span>
                  </li>
                ) : (
                  <li>
                    <Tick />
                    <span>Every 2nd/3rd IO has its main campaign in the file</span>
                  </li>
                )}
              </ul>

              {demo ? (
                <Notice kind="info" title="Demo mode.">
                  <div>Building is switched off in demo mode. Sign in with your CleverAds Google account to build the sheet.</div>
                </Notice>
              ) : null}

              {building || (step && !result && !buildError) ? (
                <ol className={s.progress} aria-live="polite">
                  {STEPS.map((x, i) => {
                    const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
                    return (
                      <li key={x.id} className={state === 'todo' ? s.progressTodo : undefined}>
                        <StepIcon state={state} />
                        <span>{x.id === 'calculate' ? `Calculating ${check.ioCount} insertion orders` : x.label}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}

              {buildError ? (
                <Notice kind="bad" title={buildError.userMessage} items={buildError instanceof ValidationError ? buildError.issues : []}>
                  <div>{buildError.action}</div>
                  {buildError instanceof AccessError && buildError.resourceUrl ? (
                    <div>
                      <a href={buildError.resourceUrl} target="_blank" rel="noopener noreferrer">
                        Open that file in Google
                      </a>
                    </div>
                  ) : null}
                </Notice>
              ) : null}

              {!result ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="primary" size="large" disabled={!canBuild || building} onClick={() => void build()}>
                    {building ? 'Building…' : buildError?.retryable ? 'Try again' : 'Build optimization sheet'}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {result ? (
            <section className={`${ui.card} ${ui.cardPad} ${s.resultCard}`} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} aria-live="polite">
              <div className={s.resultHead}>
                <SuccessBadge />
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600 }}>Report ready</h2>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
                    {result.name}
                  </div>
                </div>
              </div>
              <div className={s.stats}>
                <div className={ui.stat}>
                  <div className={ui.statValue}>{result.ioCount}</div>
                  <div className={ui.statLabel}>Insertion orders</div>
                </div>
                <div className={ui.stat}>
                  <div className={ui.statValue}>{result.urgentCampaigns}</div>
                  <div className={ui.statLabel}>Urgent (ending ≤ {c.urgentDays} days)</div>
                </div>
                <div className={ui.stat}>
                  <div className={ui.statValue}>{result.marginCampaigns}</div>
                  <div className={ui.statLabel}>Margin issues{result.lowestMargin != null ? ` · lowest ${pct(result.lowestMargin)}` : ''}</div>
                </div>
              </div>
              {!result.inResultsFolder ? (
                <Notice kind="warn" title="Saved in your My Drive.">
                  <div>Google did not let the app put it in the Results folder. Open it and move it there with “Move”.</div>
                </Notice>
              ) : null}
              {result.warnings.length ? (
                <Notice kind="warn" title={`Please check (${result.warnings.length})`}>
                  <ul>
                    {result.warnings.slice(0, 5).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  {result.warnings.length > 5 ? (
                    <details className={s.more}>
                      <summary>Show all {result.warnings.length}</summary>
                      <ul>
                        {result.warnings.slice(5).map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </Notice>
              ) : null}
              <div className={s.resultActions}>
                <a className={`${ui.btn} ${ui.primary} ${ui.large}`} href={result.url} target="_blank" rel="noopener noreferrer">
                  Open in Google Sheets
                </a>
                <div className={s.downloads}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Download</span>
                  <a className={`${ui.btn} ${ui.outline} ${ui.small}`} href={result.downloads.xlsx} target="_blank" rel="noopener noreferrer">
                    XLSX
                  </a>
                  <a className={`${ui.btn} ${ui.outline} ${ui.small}`} href={result.downloads.pdf} target="_blank" rel="noopener noreferrer">
                    PDF
                  </a>
                  <a className={`${ui.btn} ${ui.outline} ${ui.small}`} href={result.downloads.csv} target="_blank" rel="noopener noreferrer">
                    CSV
                  </a>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className={s.side}>
          <section className={`${ui.card}`} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>Rates · Click ads</h2>
            <dl className={s.dl}>
              <dt>Client CPC</dt>
              <dd>A${c.clientCpc.toFixed(2)}</dd>
              <dt>Click buffer</dt>
              <dd>{pct(c.clickBuffer)}</dd>
              <dt>FS service fee</dt>
              <dd>{pct(c.fsRate)}</dd>
              <dt>Nova fee</dt>
              <dd>A${c.novaCpm.toFixed(2)} CPM</dd>
              <dt>Minimum margin</dt>
              <dd>{pct(c.minMargin)}</dd>
              <dt>Urgent window</dt>
              <dd>{c.urgentDays} days</dd>
              <dt>CTR range</dt>
              <dd>
                {pct(c.ctrLow)}–{pct(c.ctrHigh)}
              </dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ReportBuilder />
      </Suspense>
    </AppShell>
  );
}
