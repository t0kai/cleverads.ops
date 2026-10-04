import { createHash } from 'node:crypto';

/**
 * Checks the Google access token the browser sends, with Google itself:
 *  1. tokeninfo: the token is live and was issued to OUR OAuth client (not another app's token).
 *  2. userinfo: the account is a verified member of the CleverAds Google Workspace (hd claim),
 *     not just any Google account that happens to use an @cleverads.com.au address.
 * Results are cached (by a hash of the token, never the token itself) for up to 5 minutes.
 */
export interface VerifiedUser {
  readonly email: string;
}

export class NotAllowedError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

const CACHE_MS = 5 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map<string, { user: VerifiedUser; until: number }>();

export function clearUserCache(): void {
  cache.clear();
}

export async function verifyGoogleUser(token: string, clientId: string, domain: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<VerifiedUser> {
  if (!/^[\w.\-~+/]+=*$/.test(token) || token.length < 20 || token.length > 4096) throw new NotAllowedError('Sign in again.', 401);
  const key = createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.user;
  cache.delete(key);

  const info = await getJson(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, undefined, fetchImpl);
  if (!info) throw new NotAllowedError('Your Google session has ended. Sign in again.', 401);
  const aud = String(info.aud ?? info.azp ?? '');
  const expiresIn = Number(info.expires_in ?? 0);
  if (aud !== clientId) throw new NotAllowedError('This sign-in was not made for CleverAds Operations.', 401);
  if (!(expiresIn > 0)) throw new NotAllowedError('Your Google session has ended. Sign in again.', 401);

  const me = await getJson('https://www.googleapis.com/oauth2/v3/userinfo', token, fetchImpl);
  if (!me) throw new NotAllowedError('Your Google session has ended. Sign in again.', 401);
  const email = String(me.email ?? '').toLowerCase();
  const hd = String(me.hd ?? '').toLowerCase();
  if (me.email_verified !== true || hd !== domain || !email.endsWith(`@${domain}`)) {
    throw new NotAllowedError(`Only @${domain} accounts can see this data.`, 403);
  }

  const user = { email };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { user, until: now + Math.min(CACHE_MS, expiresIn * 1000) });
  return user;
}

/** JSON body, or null when Google says the token is not valid (4xx). Throws on network trouble or 5xx. */
async function getJson(url: string, bearer: string | undefined, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  const res = await fetchImpl(url, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, cache: 'no-store' });
  if (res.status >= 400 && res.status < 500) return null;
  if (!res.ok) throw new Error(`Google sign-in check failed (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}
