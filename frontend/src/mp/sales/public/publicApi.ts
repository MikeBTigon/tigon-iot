// "Sell more" release — client for the public API (/api/public/<area>/<action>, served by mpSalesPublic).
const ORIGIN = 'https://tigoniot.com';
const base = () => (typeof location !== 'undefined' && (location.origin === ORIGIN || location.hostname.endsWith('.web.app')) ? '' : ORIGIN);

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}/api/public/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Something went wrong (HTTP ${res.status}).`);
  return json as T;
}

export const publicGet = <T,>(path: string) => call<T>('GET', path);
export const publicPost = <T,>(path: string, body: unknown) => call<T>('POST', path, body);
