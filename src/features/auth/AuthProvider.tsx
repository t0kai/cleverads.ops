'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { signInWithGoogle, signOutOfGoogle, type GoogleSession, type GoogleUser } from '@/adapters/google-auth/gis';
import { getAppConfig, isGoogleConfigured } from '@/shared/config';
import { AuthError, toAppError, type AppError } from '@/shared/errors';

interface AuthState {
  readonly user: GoogleUser | null;
  readonly busy: boolean;
  readonly error: AppError | null;
  readonly demo: boolean;
  readonly googleReady: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** A valid access token, renewed silently a few minutes before it expires. */
  getAccessToken(): Promise<string>;
}

const AuthContext = createContext<AuthState | null>(null);
const RENEW_MS = 5 * 60 * 1000;

const DEMO_USER: GoogleUser = { email: 'demo@cleverads.com.au', name: 'Demo user', picture: undefined, domain: 'cleverads.com.au' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = getAppConfig();
  // Session lives in memory only. Closing the tab signs you out.
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [demoUser, setDemoUser] = useState<GoogleUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const googleReady = isGoogleConfigured(config);

  const signIn = useCallback(async () => {
    setError(null);
    if (!googleReady) {
      if (config.demoMode) {
        setDemoUser(DEMO_USER);
        return;
      }
      setError(new AuthError('Google sign-in is not set up yet.', 'Add the Google Client ID (see README › Google Cloud).'));
      return;
    }
    setBusy(true);
    try {
      setSession(await signInWithGoogle(config.googleClientId, config.allowedDomain));
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  }, [config, googleReady]);

  const signOut = useCallback(async () => {
    const token = session?.accessToken;
    setSession(null);
    setDemoUser(null);
    if (token) await signOutOfGoogle(token);
  }, [session]);

  const getAccessToken = useCallback(async () => {
    if (!session) throw new AuthError('You are signed out.');
    if (session.expiresAt - Date.now() > RENEW_MS) return session.accessToken;
    const renewed = await signInWithGoogle(config.googleClientId, config.allowedDomain, '');
    setSession(renewed);
    return renewed.accessToken;
  }, [session, config]);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? demoUser,
      busy,
      error,
      demo: demoUser !== null,
      googleReady,
      signIn,
      signOut,
      getAccessToken,
    }),
    [session, demoUser, busy, error, googleReady, signIn, signOut, getAccessToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
