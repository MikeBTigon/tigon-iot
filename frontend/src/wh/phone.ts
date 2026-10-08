// Website phone numbers are stored as +1-xxx-xxx-xxxx, whatever way they were typed.

/** "(215) 555-0123", "2155550123", "1 215 555 0123", "+1.215.555.0123" → "+1-215-555-0123". */
export function formatUsPhone(input: string): { phone: string; error: string } {
  const raw = String(input || '').trim();
  if (!raw) return { phone: '', error: '' };
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return { phone: '', error: 'Enter a 10-digit US phone number, e.g. 215-555-0123.' };
  return { phone: `+1-${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, error: '' };
}

/** tel: link for a stored phone ("+1-215-555-0123" → "tel:+12155550123"). */
export const telHref = (phone: string) => `tel:+${phone.replace(/\D/g, '')}`;
