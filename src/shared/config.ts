import { z } from 'zod';

/**
 * App config comes from NEXT_PUBLIC_* variables at build time. They are public by design:
 * this is a static site with no server, so nothing here may be a secret.
 * Read once, validated once, then frozen.
 */
const AppConfigSchema = z.object({
  googleClientId: z.string().trim(),
  allowedDomain: z.string().trim().min(3).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Not a domain'),
  hubDataSheetId: z.string().trim(),
  developerEmail: z.email(),
  /** The Home clock's starting zone. Display only, never used in calculations. */
  defaultTimeZone: z.string().trim().min(1),
  /** Every calculation (TODAY, days left, Urgent) and every report sheet uses this zone. */
  reportTimeZone: z.string().trim().min(1),
  /** Local preview without Google (fake user, no Google calls). Never enable on Vercel production. */
  demoMode: z.boolean(),
});

export type AppConfig = Readonly<z.infer<typeof AppConfigSchema>>;

let cached: AppConfig | undefined;

export function getAppConfig(): AppConfig {
  if (cached) return cached;
  // Next.js inlines these at build time; each must be referenced by its full name.
  const parsed = AppConfigSchema.safeParse({
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    allowedDomain: process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? 'cleverads.com.au',
    hubDataSheetId: process.env.NEXT_PUBLIC_HUB_DATA_SHEET_ID ?? '',
    developerEmail: process.env.NEXT_PUBLIC_DEVELOPER_EMAIL ?? 'mr.taifur@gmail.com',
    defaultTimeZone: process.env.NEXT_PUBLIC_DEFAULT_TIME_ZONE ?? 'Australia/Sydney',
    reportTimeZone: process.env.NEXT_PUBLIC_REPORT_TIME_ZONE ?? 'Asia/Dhaka',
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
  });
  if (!parsed.success) {
    throw new Error(`App config is invalid: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

/** True when Google sign-in can work (a Client ID has been set). */
export function isGoogleConfigured(config: AppConfig = getAppConfig()): boolean {
  return config.googleClientId.endsWith('.apps.googleusercontent.com');
}
