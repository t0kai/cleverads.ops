import { describe, expect, it } from 'vitest';
import { buildRawMessage } from './sendMail';

const decode = (raw: string) => {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
};

describe('buildRawMessage', () => {
  it('builds a UTF-8 message and blocks header injection', () => {
    const raw = buildRawMessage({ to: 'dev@example.com\r\nBcc: x@evil.com', subject: 'Help ✓', text: 'বাংলা text', replyTo: 'a@cleverads.com.au' });
    expect(raw).not.toMatch(/[+/=]/);
    const msg = decode(raw);
    expect(msg).toContain('To: dev@example.com Bcc: x@evil.com');
    expect(msg).not.toMatch(/\r\nBcc:/);
    expect(msg).toContain('Reply-To: a@cleverads.com.au');
    expect(msg).toContain('Subject: =?UTF-8?B?');
  });
});
