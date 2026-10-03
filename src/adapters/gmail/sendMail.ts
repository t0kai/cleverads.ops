import { googleFetch } from '@/adapters/google/http';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly replyTo?: string;
}

/** RFC 2822 message, base64url-encoded as the Gmail API expects. Headers are stripped of line breaks. */
export function buildRawMessage(m: MailMessage): string {
  const clean = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
  const subject = `=?UTF-8?B?${toBase64(clean(m.subject))}?=`;
  const lines = [
    `To: ${clean(m.to)}`,
    ...(m.replyTo ? [`Reply-To: ${clean(m.replyTo)}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(m.text),
  ];
  return toBase64(lines.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Sends from the signed-in user's own Gmail (scope gmail.send: send only, cannot read mail). */
export async function sendMail(token: string, message: MailMessage): Promise<void> {
  await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', token, {
    method: 'POST',
    body: { raw: buildRawMessage(message) },
    retries: 2,
  });
}
