// Abuse protection for the public (no sign-in) customer pages and form endpoints:
//   trustedClientIp   — the caller's IP from headers a client can't forge (Firebase Hosting's Fastly-Client-IP, else the
//                       LAST X-Forwarded-For entry, which Google's front end appends — never the first, which anyone can set)
//   phoneDailyCap     — at most N submissions per phone per area per New York day (mp_meta/pub_phone_*, expireAt)
//   verifyTurnstile   — Cloudflare Turnstile check when TURNSTILE_SECRET is set (fails CLOSED for the sales pages)
//   consentRecord     — what we store when a customer ticks the "OK to text me" box (TCPA proof)
import * as logger from 'firebase-functions/logger';
import {C, DAY_MS, db, expireIn, nyDateKey} from './util';
import {PublicError} from './publicTypes';

type Headers = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

/** Client IP: Fastly-Client-IP (set by Firebase Hosting), else the last X-Forwarded-For hop, else the socket. */
export function trustedClientIp(headers: Headers, socketIp?: string): string {
  const fastly = first(headers['fastly-client-ip']).trim();
  if (fastly) return fastly.slice(0, 64);
  const xff = first(headers['x-forwarded-for']).split(',').map((s) => s.trim()).filter(Boolean);
  if (xff.length) return xff[xff.length - 1].slice(0, 64);
  return String(socketIp || '').replace(/^::ffff:/, '').slice(0, 64) || 'unknown';
}

/** Public submissions allowed per phone number, per area, per New York day. */
export const PHONE_DAILY_CAP = 3;

/** Counts one submission for this phone (+1XXXXXXXXXX); throws 429 when over the cap. */
export async function phoneDailyCap(area: string, phone: string, cap = PHONE_DAILY_CAP, now = Date.now()): Promise<number> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (!digits) return 0;
  const day = nyDateKey(now).replace(/-/g, '');
  const ref = db().collection(C.meta).doc(`pub_phone_${area.replace(/[^a-z]/gi, '').slice(0, 20)}_${digits}_${day}`);
  const n = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const c = Number(s.get('count') || 0) + 1;
    tx.set(ref, {count: c, area, day, expireAt: expireIn(2 * DAY_MS)});
    return c;
  });
  if (n > cap) {
    throw new PublicError(429, 'We already got your request today — we\'ll be in touch soon. Need us now? Please call the store.');
  }
  return n;
}

export const turnstileConfigured = () => !!process.env.TURNSTILE_SECRET;

type Fetcher = typeof fetch;

/**
 * Cloudflare Turnstile. Returns 'ok' | 'off' (no secret set) | 'missing' | 'failed' | 'unavailable'.
 * `secret` defaults to process.env.TURNSTILE_SECRET.
 */
export async function verifyTurnstile(token: string, ip: string, secret = process.env.TURNSTILE_SECRET || '',
  fetcher: Fetcher = fetch): Promise<'ok' | 'off' | 'missing' | 'failed' | 'unavailable'> {
  if (!secret) return 'off';
  if (!token) return 'missing';
  try {
    const body = new URLSearchParams({secret, response: token.slice(0, 2048)});
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const r = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(5000),
    });
    const j = (await r.json()) as {success?: boolean};
    return j.success ? 'ok' : 'failed';
  } catch (e) {
    logger.warn('turnstile unavailable', e instanceof Error ? e.message : e);
    return 'unavailable';
  }
}

/** Sales pages: when Turnstile is set up, every POST must pass it (fails closed). */
export async function requireTurnstile(body: Record<string, unknown>, ip: string): Promise<void> {
  if (!turnstileConfigured()) return;
  const token = String(body.turnstileToken || body['cf-turnstile-response'] || '');
  const r = await verifyTurnstile(token, ip);
  if (r === 'ok' || r === 'off') return;
  if (r === 'unavailable') throw new PublicError(503, 'We couldn\'t check your request right now. Please try again in a minute, or call us.');
  throw new PublicError(403, 'Please complete the "I\'m not a robot" check and try again.');
}

/** Fields stored with smsConsent: true (proof of consent). `text` = the exact checkbox wording the page showed. */
export function consentRecord(body: Record<string, unknown>, source: string, ip: string, now = Date.now()) {
  const text = String(body.consentText ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  return {
    smsConsent: true, smsConsentAt: now, smsConsentSource: source.slice(0, 60), smsConsentIp: ip.slice(0, 64),
    ...(text ? {smsConsentText: text} : {}),
  };
}
