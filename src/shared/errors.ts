/**
 * Every error the user can see goes through one of these classes.
 * Rule: never show a stack trace. Show what happened, what to do, and whether retrying can help.
 */
export type ErrorKind = 'validation' | 'auth' | 'access' | 'google-api' | 'module';

export class AppError extends Error {
  readonly kind: ErrorKind;
  /** Plain sentence shown to the user. */
  readonly userMessage: string;
  /** What the user should do next. */
  readonly action: string;
  /** True when pressing "Try again" may succeed. */
  readonly retryable: boolean;

  constructor(kind: ErrorKind, userMessage: string, action: string, retryable: boolean, cause?: unknown) {
    super(userMessage, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.kind = kind;
    this.userMessage = userMessage;
    this.action = action;
    this.retryable = retryable;
  }
}

/** The input is wrong (CSV, settings, a missing target). Fix the input, then build again. */
export class ValidationError extends AppError {
  readonly issues: readonly string[];
  constructor(userMessage: string, issues: readonly string[] = [], action = 'Fix the items listed, then try again.') {
    super('validation', userMessage, action, false);
    this.issues = issues;
  }
}

/** Not signed in, wrong domain, or the session expired. */
export class AuthError extends AppError {
  constructor(userMessage: string, action = 'Sign in again with your CleverAds Google account.', cause?: unknown) {
    super('auth', userMessage, action, false, cause);
  }
}

/** Signed in, but Google says no access to a sheet or folder (HTTP 403/404). */
export class AccessError extends AppError {
  readonly resourceUrl: string | undefined;
  constructor(userMessage: string, resourceUrl?: string, cause?: unknown) {
    super('access', userMessage, 'Ask the owner of that sheet for access, then try again.', false, cause);
    this.resourceUrl = resourceUrl;
  }
}

/** Google is busy, down, or the network dropped. Usually fixed by trying again. */
export class GoogleApiError extends AppError {
  readonly status: number | undefined;
  constructor(userMessage: string, status?: number, cause?: unknown) {
    super('google-api', userMessage, 'Try again in a minute. Your choices are kept.', true, cause);
    this.status = status;
  }
}

/** A bug inside one advertiser's rules module. Only that run stops. */
export class ModuleError extends AppError {
  readonly moduleId: string;
  readonly runId: string;
  constructor(moduleId: string, runId: string, cause?: unknown) {
    super(
      'module',
      `Something went wrong in the ${moduleId.toUpperCase()} rules.`,
      `Send the run ID ${runId} to the developer from the User guide.`,
      false,
      cause,
    );
    this.moduleId = moduleId;
    this.runId = runId;
  }
}

/** Turn anything thrown into an AppError so the UI only ever handles one shape. */
export function toAppError(error: unknown, runId = 'n/a'): AppError {
  if (error instanceof AppError) return error;
  return new ModuleError('app', runId, error);
}
