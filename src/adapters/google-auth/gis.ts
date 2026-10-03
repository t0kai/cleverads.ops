'use client';

import { AuthError } from '@/shared/errors';
import { googleFetch } from '@/adapters/google/http';

/**
 * Google Identity Services, token model. The browser talks to Google directly; the password is
 * typed on Google's page only. The access token stays in memory (never localStorage or cookies).
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
] as const;

export interface GoogleUser {
  readonly email: string;
  readonly name: string;
  readonly picture: string | undefined;
  readonly domain: string;
}

export interface GoogleSession {
  readonly user: GoogleUser;
  readonly accessToken: string;
  /** ms since epoch */
  readonly expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      hd?: string;
      prompt?: string;
      callback: (r: TokenResponse) => void;
      error_callback?: (e: { type: string }) => void;
    }): TokenClient;
    revoke(token: string, done?: () => void): void;
  };
}
declare global {
  interface Window {
    google?: { accounts?: GoogleAccounts };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleAccounts> | undefined;

function loadGis(): Promise<GoogleAccounts> {
  if (window.google?.accounts) return Promise.resolve(window.google.accounts);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (window.google?.accounts ? resolve(window.google.accounts) : reject(new AuthError('Google sign-in did not load.')));
    s.onerror = () => {
      loading = undefined;
      reject(new AuthError('Google sign-in could not load. Check your connection or ad blocker.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Google's popup and returns a session, or throws AuthError. Only allowedDomain accounts pass. */
export async function signInWithGoogle(clientId: string, allowedDomain: string, prompt: '' | 'consent' | 'select_account' = 'select_account'): Promise<GoogleSession> {
  const accounts = await loadGis();
  const token = await new Promise<TokenResponse>((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES.join(' '),
      hd: allowedDomain,
      callback: resolve,
      error_callback: (e) =>
        reject(new AuthError(e.type === 'popup_closed' ? 'The Google window was closed before sign-in finished.' : 'The Google sign-in window was blocked.', 'Allow pop-ups for this site, then press Continue with Google again.')),
    });
    client.requestAccessToken({ prompt });
  });
  if (!token.access_token || token.error) {
    throw new AuthError(token.error === 'access_denied' ? 'Access to Sheets and Drive was not allowed.' : 'Google sign-in did not finish.');
  }

  const info = await googleFetch<{ email?: string; name?: string; picture?: string; hd?: string; email_verified?: boolean }>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    token.access_token,
    { retries: 1 },
  );
  const domain = (info.hd ?? info.email?.split('@')[1] ?? '').toLowerCase();
  if (!info.email || !info.email_verified || domain !== allowedDomain.toLowerCase()) {
    accounts.oauth2.revoke(token.access_token);
    throw new AuthError(`Only @${allowedDomain} accounts can use CleverAds Operations.`, `Sign in with your @${allowedDomain} Google account.`);
  }
  return {
    user: { email: info.email, name: info.name ?? info.email, picture: info.picture, domain },
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
}

export async function signOutOfGoogle(accessToken: string): Promise<void> {
  const accounts = await loadGis().catch(() => undefined);
  await new Promise<void>((resolve) => (accounts ? accounts.oauth2.revoke(accessToken, resolve) : resolve()));
}
