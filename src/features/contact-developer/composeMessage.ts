export interface DeveloperMessageInput {
  readonly fromEmail: string;
  readonly fromName: string;
  readonly advertiser: string;
  readonly problemType: string;
  readonly text: string;
  /** Last run details (file name, time, run ID, error). Never CSV contents. */
  readonly runDetails?: string;
}

export const MAX_MESSAGE_LENGTH = 5000;

/** Plain-text email for the developer. The text is trimmed and length-capped. */
export function composeDeveloperMessage(m: DeveloperMessageInput): { subject: string; text: string } {
  const body = m.text.trim().slice(0, MAX_MESSAGE_LENGTH);
  return {
    subject: `[CleverAds Operations] ${m.problemType} · ${m.advertiser}`,
    text: [
      `From: ${m.fromName} <${m.fromEmail}>`,
      `Advertiser: ${m.advertiser}`,
      `Problem: ${m.problemType}`,
      '',
      body,
      ...(m.runDetails ? ['', '— Last run —', m.runDetails] : []),
    ].join('\n'),
  };
}
