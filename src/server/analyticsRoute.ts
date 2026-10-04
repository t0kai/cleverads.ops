import { SheetFormatError } from '@/engine/analytics/parseSheet';
import type { AnalyticsPayload } from '@/engine/analytics/types';
import { SheetAccessError } from './analyticsData';
import { serviceAccountEmail, type ConfigResult, type ServerConfig } from './config';
import { allowRequest } from './rateLimit';
import { NotAllowedError, type VerifiedUser } from './verifyUser';

/**
 * GET /api/analytics/data
 * Every answer is JSON, never cached by a browser or CDN, and errors never include a stack trace,
 * the sheet ID or any token.
 */
export interface RouteDeps {
  readonly config: () => ConfigResult;
  readonly verify: (token: string, config: ServerConfig) => Promise<VerifiedUser>;
  readonly load: (config: ServerConfig, refresh: boolean) => Promise<AnalyticsPayload>;
}

export type ErrorCode = 'signed_out' | 'not_allowed' | 'not_configured' | 'no_access' | 'bad_sheet' | 'too_many' | 'unavailable';

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization', 'Content-Type': 'application/json; charset=utf-8' };

function fail(status: number, error: ErrorCode, message: string, action: string): Response {
  return new Response(JSON.stringify({ error, message, action }), { status, headers: HEADERS });
}

export async function handleAnalyticsRequest(req: Request, deps: RouteDeps): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const token = /^Bearer (.+)$/i.exec(auth)?.[1]?.trim();
  if (!token) return fail(401, 'signed_out', 'You are signed out.', 'Sign in with your CleverAds Google account.');

  const cfg = deps.config();
  if (!cfg.ok) {
    console.error('analytics: not configured:', cfg.reason);
    return fail(503, 'not_configured', 'Performance Analytics is not connected to its data sheet yet.', 'Ask the developer to finish the setup (README › Performance Analytics).');
  }
  const config = cfg.config;

  let user: VerifiedUser;
  try {
    user = await deps.verify(token, config);
  } catch (e) {
    if (e instanceof NotAllowedError) {
      return fail(e.status, e.status === 401 ? 'signed_out' : 'not_allowed', e.message, e.status === 401 ? 'Sign in again.' : `Sign in with your @${config.allowedDomain} account.`);
    }
    console.error('analytics: sign-in check failed:', (e as Error).message);
    return fail(503, 'unavailable', 'Google did not answer the sign-in check.', 'Try again in a minute.');
  }

  if (!allowRequest(user.email)) return fail(429, 'too_many', 'Too many refreshes in a short time.', 'Wait a minute, then try again.');

  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  try {
    const payload = await deps.load(config, refresh);
    return new Response(JSON.stringify(payload), { status: 200, headers: HEADERS });
  } catch (e) {
    if (e instanceof SheetAccessError) {
      return fail(502, 'no_access', 'The app cannot open the data sheet.', `Share the sheet (Viewer) with ${serviceAccountEmail(config.credentials)}.`);
    }
    if (e instanceof SheetFormatError) return fail(422, 'bad_sheet', e.message, 'Fix the Data tab headings (see its How to update tab), then refresh.');
    console.error('analytics: load failed:', (e as Error).message);
    return fail(502, 'unavailable', 'Google Sheets did not answer.', 'Try again in a minute.');
  }
}
