'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogoFull } from '@/components/Logo';
import { Notice } from '@/components/Notice';
import { useAuth } from '@/features/auth/AuthProvider';
import { getAppConfig } from '@/shared/config';
import s from './signin.module.css';

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function SignInPage() {
  const { user, busy, error, signIn } = useAuth();
  const router = useRouter();
  const { allowedDomain } = getAppConfig();

  useEffect(() => {
    if (user) router.replace('/home/');
  }, [user, router]);

  return (
    <div className={s.page}>
      <div className={`${s.blob} ${s.blob1}`} />
      <div className={`${s.blob} ${s.blob2}`} />
      <div className={`${s.blob} ${s.blob3}`} />
      <div className={s.float}>
        <div className={s.ring}>
          <div className={s.card}>
            <div className={s.logo}>
              <LogoFull height={104} />
            </div>
            <div className={s.sub}>Operations</div>
            <div className={s.rule} />
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>Sign in</h1>
            <p className={s.lead}>Use your authorised email to access CleverAds Operations.</p>
            <button type="button" className={s.google} onClick={() => void signIn()} disabled={busy}>
              <GoogleG />
              {busy ? 'Waiting for Google…' : 'Continue with Google'}
            </button>
            <p className={s.note}>
              Only <strong style={{ fontWeight: 600, color: 'var(--ink-2)' }}>@{allowedDomain}</strong> accounts are permitted.
            </p>
            {error ? (
              <div className={s.error}>
                <Notice kind="bad" title={error.userMessage}>
                  <div>{error.action}</div>
                </Notice>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className={s.footer}>CleverAds Operations · © {new Date().getFullYear()}</div>
    </div>
  );
}
