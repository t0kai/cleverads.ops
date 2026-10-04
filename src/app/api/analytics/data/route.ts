import { loadAnalytics, sheetsReader } from '@/server/analyticsData';
import { handleAnalyticsRequest } from '@/server/analyticsRoute';
import { readServerConfig } from '@/server/config';
import { serviceAccessToken } from '@/server/serviceToken';
import { verifyGoogleUser } from '@/server/verifyUser';

// Always run per request (never pre-rendered), on Node (Google's auth library needs it).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request): Promise<Response> {
  return handleAnalyticsRequest(req, {
    config: () => readServerConfig(),
    verify: (token, config) => verifyGoogleUser(token, config.googleClientId, config.allowedDomain),
    load: (config, refresh) => loadAnalytics(config, sheetsReader(() => serviceAccessToken(config.credentials, req.headers.get('x-vercel-oidc-token'))), { refresh }),
  });
}
