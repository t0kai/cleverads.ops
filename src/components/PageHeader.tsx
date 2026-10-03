import type { ReactNode } from 'react';
import { BackButton } from './BackButton';
import ui from './ui.module.css';

export function PageHeader({ title, lead, backHref, actions }: { title: string; lead?: string; backHref?: string; actions?: ReactNode }) {
  return (
    <div className={ui.pageHeader} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div className={ui.pageHeader}>
        {backHref ? <BackButton href={backHref} /> : null}
        <div>
          <h1 className={ui.pageTitle}>{title}</h1>
          {lead ? <p className={ui.pageLead}>{lead}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  );
}
