'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { demoRows } from '@/engine/analytics/demoData';
import type { AnalyticsPayload } from '@/engine/analytics/types';
import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Loads the analytics rows once per page visit (one small request), keeps them while the user plays
 * with filters, and refreshes on demand. Every failure becomes a plain message with a next step.
 */
const Row = z.object({
  advertiser: z.string().min(1).max(120),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  impressions: z.number().finite().min(0),
  clicks: z.number().finite().min(0),
  media: z.number().finite().min(0),
  dv: z.number().finite().min(0),
  fs: z.number().finite().min(0),
  total: z.number().finite().min(0),
});
const Payload = z.object({
  rows: z.array(Row).max(20_000),
  warnings: z.array(z.object({ row: z.number(), message: z.string() })).max(50),
  fetchedAt: z.string(),
});

export interface LoadError {
  readonly title: string;
  readonly action: string;
  readonly retryable: boolean;
  readonly signIn: boolean;
}

export type DataState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: AnalyticsPayload; readonly refreshing: boolean; readonly refreshError: LoadError | null }
  | { readonly status: 'error'; readonly error: LoadError };

const TIMEOUT_MS = 25_000;

async function readError(res: Response): Promise<LoadError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; action?: string };
  const signIn = res.status === 401;
  return {
    title: body.message ?? (signIn ? 'Your Google session has ended.' : 'The data could not be loaded.'),
    action: body.action ?? (signIn ? 'Sign in again.' : 'Try again in a minute.'),
    retryable: res.status === 429 || res.status >= 500,
    signIn,
  };
}

export function useAnalyticsData(): DataState & { reload: (refresh?: boolean) => void } {
  const { demo, getAccessToken, user } = useAuth();
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setState((s) => (s.status === 'ready' ? { ...s, refreshing: true, refreshError: null } : { status: 'loading' }));

      const fail = (error: LoadError) => {
        if (ctrl.signal.aborted) return;
        setState((s) => (s.status === 'ready' ? { ...s, refreshing: false, refreshError: error } : { status: 'error', error }));
      };

      if (demo) {
        // Preview mode: made-up data, no network. A short pause on Refresh so the feedback is visible.
        if (refresh) await new Promise((r) => setTimeout(r, 350));
        if (ctrl.signal.aborted) return;
        setState({ status: 'ready', data: { rows: demoRows(), warnings: [], fetchedAt: new Date().toISOString() }, refreshing: false, refreshError: null });
        return;
      }

      const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/analytics/data/${refresh ? '?refresh=1' : ''}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) return fail(await readError(res));
        const parsed = Payload.safeParse(await res.json());
        if (!parsed.success) return fail({ title: 'The data came back in an unexpected shape.', action: 'Try again. If it keeps happening, tell the developer.', retryable: true, signIn: false });
        if (!ctrl.signal.aborted) setState({ status: 'ready', data: parsed.data, refreshing: false, refreshError: null });
      } catch (e) {
        const timedOut = ctrl.signal.reason instanceof DOMException && ctrl.signal.reason.name === 'TimeoutError';
        if (ctrl.signal.aborted && !timedOut) return;
        const signedOut = e instanceof Error && e.name === 'AuthError';
        fail(
          signedOut
            ? { title: 'Your Google session has ended.', action: 'Sign in again.', retryable: false, signIn: true }
            : timedOut
              ? { title: 'Loading took too long.', action: 'Check your connection, then try again.', retryable: true, signIn: false }
              : { title: 'Could not reach CleverAds Operations.', action: 'Check your internet connection, then try again.', retryable: true, signIn: false },
        );
      } finally {
        clearTimeout(timer);
      }
    },
    [demo, getAccessToken],
  );

  useEffect(() => {
    if (!user) return;
    void load(false);
    return () => abort.current?.abort();
    // Load once per signed-in user; filters never refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const reload = useCallback((refresh = true) => void load(refresh), [load]);
  return { ...state, reload };
}
