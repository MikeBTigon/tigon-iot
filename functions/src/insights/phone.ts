// Insights — phone number helpers (pure, no Firebase): every way a US number may have been typed.

/** "+12155550123" from any US number; '' if not 10 digits. */
export function toE164(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `+1${d}` : '';
}

/**
 * Common stored forms of one number, for Firestore equality queries:
 * 2155550123, 12155550123, +12155550123, (215) 555-0123, 215-555-0123, +1-215-555-0123, 215.555.0123, 215 555 0123.
 * Returns [] when the number is not a 10-digit US number.
 */
export function phoneVariants(raw: unknown): string[] {
  const e = toE164(raw);
  if (!e) return [];
  const d = e.slice(2);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6);
  return Array.from(new Set([
    d, `1${d}`, e, `(${a}) ${b}-${c}`, `${a}-${b}-${c}`, `+1-${a}-${b}-${c}`, `${a}.${b}.${c}`, `${a} ${b} ${c}`, `+1 (${a}) ${b}-${c}`,
  ]));
}

/** "(215) 555-0123" for display. */
export function displayPhone(raw: unknown): string {
  const e = toE164(raw);
  return e ? `(${e.slice(2, 5)}) ${e.slice(5, 8)}-${e.slice(8)}` : String(raw ?? '');
}
