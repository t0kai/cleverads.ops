import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetFormatError } from '@/engine/analytics/parseSheet';
import { clearAnalyticsCache, loadAnalytics, MIN_REFRESH_MS, SheetAccessError, sheetsReader } from './analyticsData';
import { handleAnalyticsRequest, type RouteDeps } from './analyticsRoute';
import { readServerConfig, type ServerConfig } from './config';
import { resetRateLimit } from './rateLimit';
import { clearUserCache, NotAllowedError, verifyGoogleUser } from './verifyUser';

const CLIENT = '123-abc.apps.googleusercontent.com';
const TOKEN = 'ya29.a0AfB_byC-valid_token-xyz';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function googleFake(opts: { aud?: string; expires?: number; hd?: string | null; email?: string; verified?: boolean; tokenStatus?: number }) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('tokeninfo')) return opts.tokenStatus ? json({ error: 'invalid_token' }, opts.tokenStatus) : json({ aud: opts.aud ?? CLIENT, expires_in: opts.expires ?? 3000 });
    return json({ email: opts.email ?? 'taifur@cleverads.com.au', email_verified: opts.verified ?? true, ...(opts.hd === null ? {} : { hd: opts.hd ?? 'cleverads.com.au' }) });
  }) as unknown as typeof fetch;
}

describe('verifyGoogleUser', () => {
  afterEach(clearUserCache);
  it('accepts a live token for our app from a CleverAds Workspace account', async () => {
    const f = googleFake({});
    await expect(verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', f)).resolves.toEqual({ email: 'taifur@cleverads.com.au' });
  });
  it('caches the answer so the next request costs no Google calls', async () => {
    const f = googleFake({});
    await verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', f);
    await verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', f);
    expect(f).toHaveBeenCalledTimes(2); // tokeninfo + userinfo, once
  });
  it('refuses a token made for another app', async () => {
    await expect(verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', googleFake({ aud: 'other.apps.googleusercontent.com' }))).rejects.toMatchObject({ status: 401 });
  });
  it('refuses an expired or revoked token', async () => {
    await expect(verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', googleFake({ tokenStatus: 400 }))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it('refuses a personal Google account that uses a company address (no hd)', async () => {
    await expect(verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', googleFake({ hd: null }))).rejects.toMatchObject({ status: 403 });
  });
  it('refuses other companies and unverified emails', async () => {
    await expect(verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', googleFake({ hd: 'other.com', email: 'x@other.com' }))).rejects.toMatchObject({ status: 403 });
    await expect(verifyGoogleUser(TOKEN, CLIENT, 'cleverads.com.au', googleFake({ verified: false }))).rejects.toMatchObject({ status: 403 });
  });
  it('rejects junk before calling Google', async () => {
    const f = googleFake({});
    await expect(verifyGoogleUser('short', CLIENT, 'cleverads.com.au', f)).rejects.toMatchObject({ status: 401 });
    await expect(verifyGoogleUser('bad token with spaces and more text', CLIENT, 'cleverads.com.au', f)).rejects.toMatchObject({ status: 401 });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('readServerConfig', () => {
  const base = { NEXT_PUBLIC_GOOGLE_CLIENT_ID: CLIENT, ANALYTICS_SHEET_ID: 'TestSheetId_0123456789abcdefXYZ' };
  it('uses keyless Workload Identity when the GCP_* variables are set', () => {
    const r = readServerConfig({ ...base, GCP_PROJECT_NUMBER: '123456789012', GCP_SERVICE_ACCOUNT_EMAIL: 'sheets-reader@x.iam.gserviceaccount.com', GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel' });
    expect(r.ok && r.config.credentials.kind).toBe('federated');
    expect(r.ok && r.config.sheetTab).toBe('Data');
  });
  it('accepts a base64 service account key as a fallback', () => {
    const key = Buffer.from(JSON.stringify({ client_email: 'a@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' })).toString('base64');
    const r = readServerConfig({ ...base, GOOGLE_SERVICE_ACCOUNT_KEY: key });
    expect(r.ok && r.config.credentials.kind).toBe('key');
  });
  it('explains what is missing', () => {
    expect(readServerConfig({ ...base })).toMatchObject({ ok: false, reason: expect.stringMatching(/No service account/) });
    expect(readServerConfig({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: CLIENT })).toMatchObject({ ok: false, reason: expect.stringMatching(/sheetId/) });
    expect(readServerConfig({ ...base, GOOGLE_SERVICE_ACCOUNT_KEY: 'not-json' })).toMatchObject({ ok: false });
  });
});

describe('loadAnalytics', () => {
  afterEach(clearAnalyticsCache);
  const source = { sheetId: 'sheet', sheetTab: 'Data' };
  const values = [
    ['Month', 'Advertiser', 'Impressions', 'Clicks', 'Media cost', 'DV fee %', 'FS fee %'],
    ['2026-08', 'ACM', 1000, 10, 1, 0.1, 0.045],
  ];
  it('reads once and serves the cache for 5 minutes', async () => {
    const read = vi.fn(async () => values);
    const a = await loadAnalytics(source, read, { now: 0 });
    await loadAnalytics(source, read, { now: 60_000 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(a.rows).toHaveLength(1);
    await loadAnalytics(source, read, { now: 6 * 60_000 });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('shares one read between requests that arrive together', async () => {
    const read = vi.fn(() => new Promise<unknown[][]>((r) => setTimeout(() => r(values), 10)));
    await Promise.all([loadAnalytics(source, read, { now: 0 }), loadAnalytics(source, read, { now: 0 }), loadAnalytics(source, read, { now: 0 })]);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('lets Refresh skip the cache, but not more than every 30 seconds', async () => {
    const read = vi.fn(async () => values);
    await loadAnalytics(source, read, { now: 0 });
    await loadAnalytics(source, read, { now: 1000, refresh: true });
    expect(read).toHaveBeenCalledTimes(1);
    await loadAnalytics(source, read, { now: MIN_REFRESH_MS + 1, refresh: true });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not cache a failure', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(values);
    await expect(loadAnalytics(source, read, { now: 0 })).rejects.toThrow('boom');
    await expect(loadAnalytics(source, read, { now: 1 })).resolves.toMatchObject({ rows: [expect.anything()] });
  });
});

describe('sheetsReader', () => {
  it('asks for raw values and date serials from the named tab', async () => {
    const f = vi.fn(async () => json({ values: [['Month']] })) as unknown as typeof fetch;
    await sheetsReader(async () => 'svc', f)({ sheetId: 'abc', sheetTab: "Data's" });
    const url = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE');
    expect(url).toContain('dateTimeRenderOption=SERIAL_NUMBER');
    expect(decodeURIComponent(url)).toContain("'Data''s'!A1:Z");
  });
  it('turns 403/404 into a clear access error', async () => {
    const f = vi.fn(async () => json({}, 403)) as unknown as typeof fetch;
    await expect(sheetsReader(async () => 'svc', f)({ sheetId: 'abc', sheetTab: 'Data' })).rejects.toBeInstanceOf(SheetAccessError);
  });
});

describe('GET /api/analytics/data', () => {
  afterEach(resetRateLimit);
  const config: ServerConfig = {
    googleClientId: CLIENT,
    allowedDomain: 'cleverads.com.au',
    sheetId: 'sheetid',
    sheetTab: 'Data',
    credentials: { kind: 'federated', projectNumber: '1', poolId: 'p', providerId: 'v', serviceAccountEmail: 'reader@x.iam.gserviceaccount.com' },
  };
  const payload = { rows: [], warnings: [], fetchedAt: '2026-10-04T00:00:00.000Z' };
  const deps = (over: Partial<RouteDeps> = {}): RouteDeps => ({
    config: () => ({ ok: true, config }),
    verify: async () => ({ email: 'taifur@cleverads.com.au' }),
    load: async () => payload,
    ...over,
  });
  const req = (token?: string, q = '') => new Request(`https://ops.example/api/analytics/data${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('returns the data with no-store caching', async () => {
    const res = await handleAnalyticsRequest(req(TOKEN), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.json()).toEqual(payload);
  });
  it('401 without a token, before touching config or Google', async () => {
    const verify = vi.fn();
    const res = await handleAnalyticsRequest(req(), deps({ verify }));
    expect(res.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });
  it('403 for someone outside CleverAds', async () => {
    const res = await handleAnalyticsRequest(req(TOKEN), deps({ verify: async () => Promise.reject(new NotAllowedError('Only @cleverads.com.au accounts can see this data.', 403)) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_allowed');
  });
  it('503 with a friendly message when setup is not finished, without leaking the reason', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleAnalyticsRequest(req(TOKEN), deps({ config: () => ({ ok: false, reason: 'secret detail' }) }));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('secret detail');
    err.mockRestore();
  });
  it('tells the user who to share the sheet with when access is missing', async () => {
    const res = await handleAnalyticsRequest(req(TOKEN), deps({ load: async () => Promise.reject(new SheetAccessError('x')) }));
    expect(res.status).toBe(502);
    expect((await res.json()).action).toContain('reader@x.iam.gserviceaccount.com');
  });
  it('422 when the sheet headings are wrong', async () => {
    const res = await handleAnalyticsRequest(req(TOKEN), deps({ load: async () => Promise.reject(new SheetFormatError('missing headings')) }));
    expect(res.status).toBe(422);
  });
  it('passes ?refresh=1 through and rate-limits a runaway tab', async () => {
    const load = vi.fn(async () => payload);
    await handleAnalyticsRequest(req(TOKEN, '?refresh=1'), deps({ load }));
    expect(load).toHaveBeenCalledWith(config, true);
    let last = 200;
    for (let i = 0; i < 40; i++) last = (await handleAnalyticsRequest(req(TOKEN), deps({ load }))).status;
    expect(last).toBe(429);
  });
  it('never sends a stack trace for unexpected failures', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleAnalyticsRequest(req(TOKEN), deps({ load: async () => Promise.reject(new Error('internal at line 42')) }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('line 42');
    err.mockRestore();
  });
});
