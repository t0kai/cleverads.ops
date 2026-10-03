'use client';

import { useRouter } from 'next/navigation';
import ui from './ui.module.css';

/** Small icon-only Back button; goes to `href` (the parent page), not browser history. */
export function BackButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button type="button" className={ui.back} aria-label="Back" title="Back" onClick={() => router.push(href)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A35A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
