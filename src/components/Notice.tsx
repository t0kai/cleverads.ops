import type { ReactNode } from 'react';
import ui from './ui.module.css';

const tone = { ok: ui.noticeOk, warn: ui.noticeWarn, bad: ui.noticeBad, info: ui.noticeInfo } as const;

export function Notice({ kind, title, items, children }: { kind: keyof typeof tone; title?: string; items?: readonly string[]; children?: ReactNode }) {
  return (
    <div role={kind === 'bad' ? 'alert' : 'status'} className={`${ui.notice} ${tone[kind]}`}>
      <div>
        {title ? <strong style={{ fontWeight: 600 }}>{title}</strong> : null}
        {children}
        {items && items.length ? (
          <ul>
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
