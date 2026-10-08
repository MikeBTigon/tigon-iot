// "Sell more" release — public (no sign-in) API for customer pages: /api/public/<area>/<action>[/<rest>…]
// (Hosting rewrite → mpSalesPublic). Areas: quote, booking, trade, prequal (closing.ts), referral (marketing.ts).
// Per-IP rate limit: 60 requests a minute.
import * as logger from 'firebase-functions/logger';
import {onRequest} from 'firebase-functions/v2/https';
import {closingPublic} from './closing';
import {marketingPublic} from './marketing';
import {PublicError} from './publicTypes';
import type {PublicHandler} from './publicTypes';
import {C, db} from './util';

const AREAS: Record<string, Record<string, PublicHandler>> = {...closingPublic, ...marketingPublic};
const PER_MINUTE = 60;

async function rateOk(ip: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const ref = db().collection(C.meta).doc(`pub_rate_${ip.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60)}`);
  const n = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const c = s.get('minute') === minute ? Number(s.get('count') || 0) + 1 : 1;
    tx.set(ref, {minute, count: c, expireAt: Date.now() + 3600_000});
    return c;
  });
  return n <= PER_MINUTE;
}

export const mpSalesPublic = onRequest({region: 'us-central1', memory: '512MiB', timeoutSeconds: 60}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  const parts = req.path.split('/').filter(Boolean);
  const i = parts.indexOf('public');
  const [area, action, ...rest] = i >= 0 ? parts.slice(i + 1) : parts;
  const handler = AREAS[area || '']?.[action || ''];
  if (!handler) {
    res.status(404).json({error: 'Not found'});
    return;
  }
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
  try {
    if (!(await rateOk(ip))) {
      res.status(429).json({error: 'Too many requests — try again in a minute.'});
      return;
    }
    const query = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : v ?? '')]));
    const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    const out = await handler({method: req.method, query, body, rest, ip});
    res.set('Cache-Control', req.method === 'GET' && out.cacheSeconds ? `public, max-age=${out.cacheSeconds}` : 'no-store');
    res.status(out.status || 200).json(out.body);
  } catch (e) {
    if (e instanceof PublicError) {
      res.status(e.status).json({error: e.message});
      return;
    }
    logger.error('mpSalesPublic failed', area, action, e);
    res.status(500).json({error: 'Something went wrong. Please call us instead.'});
  }
});
