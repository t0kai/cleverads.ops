/** Short, readable run ID shown to users ("RUN-3F9A2C"). Uses the browser's crypto when present. */
export function newRunId(random: () => number = Math.random): string {
  const bytes = new Uint8Array(3);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
  }
  return 'RUN-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
