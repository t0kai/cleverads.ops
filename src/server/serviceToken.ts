import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient, JWT, type AuthClient } from 'google-auth-library';
import type { ServiceCredentials } from './config';

/**
 * A short-lived Google access token for the service account, with read-only Sheets access.
 * Federated (keyless): Vercel signs an OIDC token for this deployment, Google swaps it for a token.
 * The client keeps and renews the token itself, so most requests cost no extra round trip.
 */
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

let client: { key: string; auth: AuthClient } | undefined;
/** On Vercel Functions the OIDC token also arrives as the x-vercel-oidc-token request header. */
let headerToken: string | undefined;

async function subjectToken(): Promise<string> {
  try {
    return await getVercelOidcToken();
  } catch (e) {
    if (headerToken) return headerToken;
    throw e;
  }
}

function makeClient(c: ServiceCredentials): AuthClient {
  if (c.kind === 'key') return new JWT({ email: c.clientEmail, key: c.privateKey, scopes: SCOPES });
  const audience = `//iam.googleapis.com/projects/${c.projectNumber}/locations/global/workloadIdentityPools/${c.poolId}/providers/${c.providerId}`;
  const auth = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${c.serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: subjectToken },
    scopes: SCOPES,
  });
  if (!auth) throw new Error('Workload Identity settings could not be loaded.');
  return auth;
}

export async function serviceAccessToken(c: ServiceCredentials, oidcHeader?: string | null): Promise<string> {
  if (oidcHeader) headerToken = oidcHeader;
  const key = JSON.stringify(c.kind === 'key' ? [c.kind, c.clientEmail] : c);
  if (!client || client.key !== key) client = { key, auth: makeClient(c) };
  const { token } = await client.auth.getAccessToken();
  if (!token) throw new Error('Google did not return a service token.');
  return token;
}
