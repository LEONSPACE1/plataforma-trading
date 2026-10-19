/** Parses "/start <code>", what Telegram sends when a t.me/<bot>?start=<code> link is opened. */
export function parseStartCode(text: string | undefined): string | null {
  const m = text?.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})$/);
  return m ? m[1] : null;
}
