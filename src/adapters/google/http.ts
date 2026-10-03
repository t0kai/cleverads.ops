import { AccessError, AuthError, GoogleApiError } from '@/shared/errors';

/**
 * Every Google REST call goes through here: bearer token, JSON, retries with backoff for
 * 429/5xx/network drops, and Google's error turned into our error classes.
 */
export interface GoogleFetchOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly retries?: number;
  /** For tests: replace the wait between retries. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly fetchImpl?: typeof fetch;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ALLOWED_HOSTS = new Set(['sheets.googleapis.com', 'www.googleapis.com', 'gmail.googleapis.com', 'oauth2.googleapis.com']);

export async function googleFetch<T>(url: string, token: string, opts: GoogleFetchOptions = {}): Promise<T> {
  const host = new URL(url).host;
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`Blocked request to ${host}`);
  const { method = 'GET', body, retries = 3, sleep = wait, fetchImpl = fetch } = opts;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch (cause) {
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new GoogleApiError('Could not reach Google. Check your internet connection.', undefined, cause);
    }

    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
      continue;
    }
    if (res.status === 401) throw new AuthError('Your Google session has ended.');
    if (res.status === 403 || res.status === 404) {
      throw new AccessError('Google says you do not have access to this sheet or folder.', url);
    }
    throw new GoogleApiError(retryable ? 'Google is busy right now.' : 'Google could not complete the request.', res.status);
  }
}
