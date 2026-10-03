'use client';

import { useEffect, useRef, useState } from 'react';
import { campaignCalc } from '@/features/calculator/campaignCalc';
import { Icon } from './Icon';
import s from './CampaignCalculator.module.css';

const money = (n: number) => 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, prefix, suffix, value, onChange, hint }: { label: string; prefix?: string; suffix?: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.label}>{label}</span>
      <span className={s.inputWrap}>
        {prefix ? <span className={s.affix}>{prefix}</span> : null}
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix ? <span className={s.affix}>{suffix}</span> : null}
      </span>
      {hint}
    </label>
  );
}

/** Popup window opened from the left menu. Typing updates the results right away. */
export function CampaignCalculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [budget, setBudget] = useState('150');
  const [margin, setMargin] = useState('75');
  const [clicks, setClicks] = useState('250');
  const [cpm, setCpm] = useState('1.10');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const num = (v: string) => Number(v.replace(/,/g, ''));
  const r = campaignCalc({ budget: num(budget), margin: num(margin) / 100, clicks: num(clicks), cpm: num(cpm) });

  return (
    <dialog ref={ref} className={s.dialog} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="calc-title">
      <div className={s.card}>
        <header className={s.head}>
          <span className={s.logo}>
            <Icon name="calc" color="#fff" size={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="calc-title" className={s.title}>
              Campaign Calculator
            </h2>
            <p className={s.sub}>How many impressions you can buy, and the CTR you need, to keep your margin.</p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close calculator">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className={s.body}>
          <section className={s.inputs} aria-label="Inputs">
            <Field label="Budget" prefix="A$" value={budget} onChange={setBudget} />
            <Field label="Profit margin" suffix="%" value={margin} onChange={setMargin} />
            <Field
              label="Click target"
              value={clicks}
              onChange={setClicks}
              hint={
                <button type="button" className={s.hint} onClick={() => num(clicks) > 0 && setBudget((num(clicks) * 0.6).toFixed(2))}>
                  Budget = clicks × A$0.60 (ACM)
                </button>
              }
            />
            <Field label="CPM" prefix="A$" value={cpm} onChange={setCpm} />
          </section>

          <section className={s.results} aria-live="polite" aria-label="Results">
            <div className={s.heroRow}>
              <div className={s.hero}>
                <div className={s.heroValue}>{r ? r.impressions.toLocaleString('en-AU') : '—'}</div>
                <div className={s.heroLabel}>Required impressions</div>
                <div className={s.heroHint}>Most you can buy at this margin</div>
              </div>
              <div className={s.hero}>
                <div className={s.heroValue}>{r ? `${(r.ctr * 100).toFixed(2)}%` : '—'}</div>
                <div className={s.heroLabel}>Required CTR</div>
                <div className={s.heroHint}>Least you need to reach the click target</div>
              </div>
            </div>
            <dl className={s.list}>
              <dt>Media cost</dt>
              <dd>{r ? money(r.media) : '—'}</dd>
              <dt>Inventory cost <span>+10% DV360</span></dt>
              <dd>{r ? money(r.inventory) : '—'}</dd>
              <dt>FS service cost <span>4.5% of media</span></dt>
              <dd>{r ? money(r.fs) : '—'}</dd>
              <dt>Nova fee <span>A$0.80 CPM</span></dt>
              <dd>{r ? money(r.nova) : '—'}</dd>
              <dt className={s.total}>Total cost</dt>
              <dd className={s.total}>{r ? money(r.totalCost) : '—'}</dd>
              <dt className={s.profit}>Target profit</dt>
              <dd className={s.profit}>{r ? money(r.profit) : '—'}</dd>
            </dl>
            {!r ? <p className={s.error}>Enter a budget, a margin under 100%, a click target and a CPM.</p> : null}
          </section>
        </div>
        <footer className={s.foot}>Impressions = Budget × (1 − margin) ÷ (CPM × 1.145 + 0.80) × 1,000</footer>
      </div>
    </dialog>
  );
}
