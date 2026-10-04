import { z } from 'zod';

/**
 * Server-only settings (Vercel env vars). Never NEXT_PUBLIC_, so they never reach the browser.
 * The data sheet is shared with a service account only; the browser never gets its ID.
 */
const Base = z.object({
  googleClientId: z.string().trim().endsWith('.apps.googleusercontent.com'),
  allowedDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
  sheetId: z.string().trim().regex(/^[A-Za-z0-9_-]{20,}$/, 'ANALYTICS_SHEET_ID does not look like a Google Sheet ID'),
  sheetTab: z.string().trim().min(1).max(100),
});

/** Keyless (recommended): Vercel OIDC token exchanged for a short-lived Google token. */
const Federated = z.object({
  kind: z.literal('federated'),
  projectNumber: z.string().regex(/^\d+$/),
  poolId: z.string().min(1),
  providerId: z.string().min(1),
  serviceAccountEmail: z.email(),
});

/** Fallback: a service account key (only if the org allows keys). */
const KeyFile = z.object({
  kind: z.literal('key'),
  clientEmail: z.email(),
  privateKey: z.string().includes('PRIVATE KEY'),
});

export type ServiceCredentials = z.infer<typeof Federated> | z.infer<typeof KeyFile>;
export type ServerConfig = z.infer<typeof Base> & { readonly credentials: ServiceCredentials };

export type ConfigResult = { readonly ok: true; readonly config: ServerConfig } | { readonly ok: false; readonly reason: string };

function readKey(raw: string): { client_email?: string; private_key?: string } {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text) as { client_email?: string; private_key?: string };
}

export function readServerConfig(env: Record<string, string | undefined> = process.env): ConfigResult {
  const base = Base.safeParse({
    googleClientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    allowedDomain: env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? 'cleverads.com.au',
    sheetId: env.ANALYTICS_SHEET_ID ?? '',
    sheetTab: env.ANALYTICS_SHEET_TAB ?? 'Data',
  });
  if (!base.success) return { ok: false, reason: base.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };

  let credentials: ServiceCredentials | undefined;
  if (env.GCP_SERVICE_ACCOUNT_EMAIL && env.GCP_PROJECT_NUMBER) {
    const f = Federated.safeParse({
      kind: 'federated',
      projectNumber: env.GCP_PROJECT_NUMBER,
      poolId: env.GCP_WORKLOAD_IDENTITY_POOL_ID ?? '',
      providerId: env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID ?? '',
      serviceAccountEmail: env.GCP_SERVICE_ACCOUNT_EMAIL,
    });
    if (!f.success) return { ok: false, reason: 'Workload Identity settings are incomplete (GCP_* variables).' };
    credentials = f.data;
  } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const key = readKey(env.GOOGLE_SERVICE_ACCOUNT_KEY);
      const k = KeyFile.safeParse({ kind: 'key', clientEmail: key.client_email, privateKey: key.private_key });
      if (!k.success) return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_KEY is not a service account key.' };
      credentials = k.data;
    } catch {
      return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_KEY could not be read.' };
    }
  }
  if (!credentials) return { ok: false, reason: 'No service account is set up (GCP_* or GOOGLE_SERVICE_ACCOUNT_KEY).' };
  return { ok: true, config: { ...base.data, credentials } };
}

/** The service account address people share the sheet with. */
export function serviceAccountEmail(c: ServiceCredentials): string {
  return c.kind === 'federated' ? c.serviceAccountEmail : c.clientEmail;
}
