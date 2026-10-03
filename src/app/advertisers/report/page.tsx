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
import { checkUpload, type UploadCheck } from '@/features/build-report/checkUpload';
import { ValidationError, toAppError, type AppError } from '@/shared/errors';
import s from './report.module.css';

const MAX_BYTES = 10 * 1024 * 1024;
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

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

function ReportBuilder() {
  const params = useSearchParams();
  const adv = SEED_ADVERTISERS.find((a) => a.id === params.get('adv')) ?? null;
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [check, setCheck] = useState<UploadCheck | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [over, setOver] = useState(false);

  const read = async (file: File) => {
    setError(null);
    setCheck(null);
    setFileName(file.name);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new ValidationError('That is not a CSV file.', ['Choose the .csv you downloaded from DV360.']);
      if (file.size > MAX_BYTES) throw new ValidationError('The file is larger than 10 MB.', ['Export only this advertiser’s insertion orders.']);
      setCheck(checkUpload(await file.text()));
    } catch (e) {
      setError(toAppError(e));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void read(f);
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
              <div className={s.file}>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontWeight: 500, fontSize: 14 }}>
                    {fileName}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{check.ioCount} insertion orders</div>
                </div>
                <Button size="small" onClick={() => input.current?.click()}>
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
                  <span>Columns found: {check.columnsFound.map((c) => c[0]?.toUpperCase() + c.slice(1)).join(', ')}</span>
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
              <Notice kind="info" title="Next step: connect Google.">
                <div>Reading targets from the ACM sheet and writing the report to Drive switch on once the Google Client ID and Hub Data sheet are set.</div>
              </Notice>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="large" disabled title="Available after Google setup">
                  Build optimization sheet
                </Button>
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
