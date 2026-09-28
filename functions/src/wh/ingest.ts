// Webhook Flows — public ingestion endpoint: POST https://tigoniot.com/hooks/{key}
// Parses JSON / urlencoded / multipart (images → Storage), checks CORS, rate limits, HMAC and spam,
// stores a wh_submissions doc (status 'queued') and answers fast. Flows run later in the engine.
import {createHash, createHmac, randomUUID, timingSafeEqual} from 'crypto';
import busboy from 'busboy';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {onRequest} from 'firebase-functions/v2/https';
import {IMAGE_FIELDS, LEAD_FIELDS, WH} from './types';
import type {WhSettings} from './types';
import {db, loadConfigByKey} from './config';
import type {WhConfig} from './config';
import {cleanValue, dedupeKeys, imageFieldFor, mapFields, mapKey} from './fields';
import {bumpStats} from './stats';

export const MAX_BODY_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PER_IP = 10;
const DEFAULT_PER_KEY = 120;
const LAST_RECEIVED_THROTTLE_MS = 60_000;

const BUILTIN_ORIGINS = ['https://tigoniot.com', 'https://www.tigoniot.com', 'https://tigon-iot.web.app', 'https://tigon-iot.firebaseapp.com'];

/** Minimal request/response shapes (express-compatible) so the handler can be called from tests. */
export interface IngestReq {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: unknown;
  query?: Record<string, unknown>;
  path?: string;
  url?: string;
  ip?: string;
}
export interface IngestRes {
  status(code: number): IngestRes;
  set(field: string, value: string): IngestRes;
  json(body: unknown): unknown;
  send(body?: unknown): unknown;
  redirect(status: number, url: string): unknown;
}

const header = (req: IngestReq, name: string): string => {
  const v = req.headers[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v || '').toString();
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** The webhook key from /hooks/{key}, /{key} or ?key=. */
export function extractKey(req: IngestReq): string {
  const path = (req.path || (req.url || '').split('?')[0] || '').split('/').filter(Boolean);
  const last = path.length ? decodeURIComponent(path[path.length - 1]) : '';
  if (last && last !== 'hooks' && /^[A-Za-z0-9_-]{8,128}$/.test(last)) return last;
  const q = req.query?.key;
  const k = Array.isArray(q) ? q[0] : q;
  return typeof k === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(k) ? k : '';
}

const originOf = (u: string) => {
  try {
    const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
    return x.protocol + '//' + x.host.toLowerCase();
  } catch {
    return '';
  }
};
const stripWww = (o: string) => o.replace('://www.', '://');

/** Is a browser Origin allowed to post to this webhook? */
export function isOriginAllowed(origin: string, domainUrl: string | undefined, settings: WhSettings): boolean {
  const o = originOf(origin);
  if (!o) return false;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  const allowed = [...BUILTIN_ORIGINS, ...(settings.allowedOrigins || [])].map(originOf).filter(Boolean);
  if (domainUrl) allowed.push(originOf(domainUrl));
  // The domain is allowed with and without "www.", and over http as well as https.
  const norm = (x: string) => stripWww(x).replace(/^http:/, 'https:');
  return allowed.some((a) => a === o || norm(a) === norm(o));
}

/** Detect the real image type from magic bytes. */
export function sniffImage(b: Buffer): {mime: string; ext: string} | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return {mime: 'image/jpeg', ext: 'jpg'};
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return {mime: 'image/png', ext: 'png'};
  if (b.toString('latin1', 0, 4) === 'GIF8') return {mime: 'image/gif', ext: 'gif'};
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return {mime: 'image/webp', ext: 'webp'};
  if (b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12);
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return {mime: 'image/heic', ext: 'heic'};
    if (brand === 'avif' || brand === 'avis') return {mime: 'image/avif', ext: 'avif'};
  }
  return null;
}

/** Client IP, server side only: Fastly (Firebase Hosting) → X-Forwarded-For → socket. */
export function clientIp(req: IngestReq): string {
  const f = header(req, 'fastly-client-ip').trim();
  if (f) return f;
  const xff = header(req, 'x-forwarded-for').split(',')[0].trim();
  if (xff) return xff;
  return (req.ip || '').replace(/^::ffff:/, '');
}

export function verifySignature(raw: Buffer, secret: string, sigHeader: string): boolean {
  if (!secret) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(sigHeader.trim());
  if (!m) return false;
  const want = createHmac('sha256', secret).update(raw).digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export function ipBlocked(ip: string, blocked: string[] = []): boolean {
  return blocked.some((b) => {
    const x = b.trim();
    if (!x) return false;
    if (x.endsWith('*')) return ip.startsWith(x.slice(0, -1));
    if (x.endsWith('.') || x.endsWith(':')) return ip.startsWith(x);
    return ip === x;
  });
}

export function blockedWordHit(values: string[], words: string[] = []): string {
  const text = values.join(' \n ').toLowerCase();
  for (const w of words) {
    const x = w.trim().toLowerCase();
    if (x && text.includes(x)) return x;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

export interface UploadIn {field: string; filename: string; mime: string; data: Buffer; truncated: boolean}
interface Parsed {values: Record<string, unknown>; files: UploadIn[]}

function flattenJson(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Record<string, unknown> = {};
  const src = obj as Record<string, unknown>;
  // Common wrappers: {fields: {...}} / {data: {...}}
  for (const wrap of ['fields', 'data', 'lead']) {
    const w = src[wrap];
    if (w && typeof w === 'object' && !Array.isArray(w)) Object.assign(out, w as object);
  }
  for (const [k, v] of Object.entries(src)) if (!(k in out) && !(['fields', 'data', 'lead'].includes(k) && v && typeof v === 'object')) out[k] = v;
  return out;
}

function parseUrlEncoded(s: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(s)) {
    const key = k.replace(/\[\]$/, '');
    out[key] = key in out ? [...([] as unknown[]).concat(out[key]), v] : v;
  }
  return out;
}

function parseMultipart(raw: Buffer, contentType: string): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const values: Record<string, unknown> = {};
    const files: UploadIn[] = [];
    let bb: busboy.Busboy;
    try {
      bb = busboy({headers: {'content-type': contentType}, limits: {fileSize: MAX_IMAGE_BYTES, files: 10, fields: 300, fieldSize: 200_000}});
    } catch (e) {
      reject(e);
      return;
    }
    bb.on('field', (name, val) => {
      const key = name.replace(/\[\]$/, '');
      values[key] = key in values ? [...([] as unknown[]).concat(values[key]), val] : val;
    });
    bb.on('file', (name, stream, info) => {
      const chunks: Buffer[] = [];
      const f: UploadIn = {field: name, filename: info.filename || '', mime: info.mimeType || '', data: Buffer.alloc(0), truncated: false};
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('limit', () => {
        f.truncated = true;
      });
      stream.on('end', () => {
        f.data = Buffer.concat(chunks);
        if (f.data.length || f.filename) files.push(f);
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve({values, files}));
    bb.end(raw);
  });
}

export async function parseBody(req: IngestReq): Promise<Parsed> {
  const ct = header(req, 'content-type').toLowerCase();
  const raw = req.rawBody && req.rawBody.length ? req.rawBody : null;
  if (ct.startsWith('multipart/form-data')) {
    if (!raw) return {values: {}, files: []};
    return parseMultipart(raw, header(req, 'content-type'));
  }
  if (ct.includes('json')) {
    if (raw) return {values: flattenJson(JSON.parse(raw.toString('utf8'))), files: []};
    return {values: flattenJson(req.body), files: []};
  }
  if (ct.startsWith('application/x-www-form-urlencoded')) {
    if (raw) return {values: parseUrlEncoded(raw.toString('utf8')), files: []};
    return {values: flattenJson(req.body), files: []};
  }
  // text/plain (sendBeacon) or no content type: try JSON, then urlencoded.
  const text = raw ? raw.toString('utf8') : typeof req.body === 'string' ? req.body : '';
  if (!text) return {values: flattenJson(req.body), files: []};
  const t = text.trim();
  if (t.startsWith('{')) return {values: flattenJson(JSON.parse(t)), files: []};
  return {values: parseUrlEncoded(t), files: []};
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/** Per-IP and per-key counters for the current minute. Returns true when over the limit. */
export async function overRateLimit(ip: string, webhookId: string, perIp: number, perKey: number): Promise<boolean> {
  if (perIp <= 0 && perKey <= 0) return false;
  const minute = Math.floor(Date.now() / 60_000);
  const expiresAt = admin.firestore.Timestamp.fromMillis((minute + 3) * 60_000);
  const col = db().collection(WH.rate);
  const ipRef = col.doc(`ip_${createHash('sha256').update(ip || 'none').digest('hex').slice(0, 20)}_${minute}`);
  const keyRef = col.doc(`key_${webhookId}_${minute}`);
  const inc = admin.firestore.FieldValue.increment(1);
  const batch = db().batch();
  if (perIp > 0) batch.set(ipRef, {count: inc, expiresAt}, {merge: true});
  if (perKey > 0) batch.set(keyRef, {count: inc, expiresAt}, {merge: true});
  await batch.commit();
  const refs = [...(perIp > 0 ? [ipRef] : []), ...(perKey > 0 ? [keyRef] : [])];
  const snaps = await db().getAll(...refs);
  for (const s of snaps) {
    const count = Number(s.get('count') || 0);
    if (s.id.startsWith('ip_') && count > perIp) return true;
    if (s.id.startsWith('key_') && count > perKey) return true;
  }
  return false;
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean | null> {
  try {
    const body = new URLSearchParams({secret, response: token});
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(5000),
    });
    const j = (await r.json()) as {success?: boolean};
    return !!j.success;
  } catch (e) {
    logger.warn('wh turnstile verification unavailable', e);
    return null; // fail open: never lose a lead because Cloudflare is unreachable
  }
}

export function downloadUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function uploadImage(webhookId: string, submissionId: string, field: string, data: Buffer, kind: {mime: string; ext: string}) {
  const bucket = admin.storage().bucket();
  const path = `wh_uploads/${webhookId}/${submissionId}/${field}.${kind.ext}`;
  const token = randomUUID();
  await bucket.file(path).save(data, {
    resumable: false,
    contentType: kind.mime,
    metadata: {contentType: kind.mime, metadata: {firebaseStorageDownloadTokens: token}},
  });
  return {path, url: downloadUrl(bucket.name, path, token)};
}

const lastTouched = new Map<string, number>();

/** Throttled lastReceivedAt on the webhook and its domain (used by the "no leads" alert). */
async function touchLastReceived(cfg: WhConfig, now: number) {
  const w = cfg.webhook!;
  const prev = Math.max(lastTouched.get(w.id) || 0, w.lastReceivedAt || 0);
  if (now - prev < LAST_RECEIVED_THROTTLE_MS) return;
  lastTouched.set(w.id, now);
  w.lastReceivedAt = now;
  const writes: Array<Promise<unknown>> = [db().collection(WH.webhooks).doc(w.id).update({lastReceivedAt: now})];
  if (w.domainId) writes.push(db().collection(WH.domains).doc(w.domainId).update({lastReceivedAt: now}));
  await Promise.all(writes.map((p) => p.catch((e) => logger.warn('wh lastReceivedAt update failed', e))));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const THANKS_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Thank you</title></head><body style="font-family:Arial,sans-serif;text-align:center;padding:48px 16px">' +
  '<h1 style="font-size:24px">Thanks! We got your message.</h1><p>We\'ll get back to you soon.</p>' +
  '<p><a href="javascript:history.back()">Go back</a></p></body></html>';

function wantsHtml(req: IngestReq): boolean {
  const accept = header(req, 'accept');
  const mode = header(req, 'sec-fetch-mode');
  return accept.includes('text/html') && (!mode || mode === 'navigate') && !header(req, 'x-requested-with');
}

function done(req: IngestReq, res: IngestRes, id: string, settings: WhSettings) {
  if (wantsHtml(req)) {
    if (settings.thankYouUrl && /^https?:\/\//i.test(settings.thankYouUrl)) {
      res.redirect(303, settings.thankYouUrl);
      return;
    }
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(THANKS_HTML);
    return;
  }
  res.status(200).json({ok: true, id});
}

export async function handleIngest(req: IngestReq, res: IngestRes): Promise<void> {
  try {
    res.set('Cache-Control', 'no-store');
    const key = extractKey(req);
    if (!key) {
      res.status(404).json({ok: false, error: 'Unknown webhook'});
      return;
    }
    const cfg = await loadConfigByKey(key);
    if (!cfg || !cfg.webhook) {
      res.status(404).json({ok: false, error: 'Unknown webhook'});
      return;
    }
    const {webhook, settings} = cfg;

    // CORS
    const origin = header(req, 'origin');
    if (origin && origin !== 'null') {
      if (!isOriginAllowed(origin, cfg.domain?.url, settings)) {
        res.status(403).json({ok: false, error: 'Origin not allowed'});
        return;
      }
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Tigon-Signature, X-Requested-With');
      res.set('Access-Control-Max-Age', '3600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (webhook.status === 'paused' || cfg.domain?.status === 'paused') {
      res.status(410).json({ok: false, error: 'This webhook is paused'});
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.status(200).json({ok: true, webhook: webhook.formName || 'Webhook'});
      return;
    }
    if (req.method !== 'POST') {
      res.set('Allow', 'POST, GET, OPTIONS');
      res.status(405).json({ok: false, error: 'Use POST'});
      return;
    }
    const raw = req.rawBody || Buffer.alloc(0);
    if (raw.length > MAX_BODY_BYTES) {
      res.status(413).json({ok: false, error: 'Too large'});
      return;
    }

    const ip = clientIp(req);
    const spam = settings.spam || {};
    const perIp = spam.perIpPerMinute ?? DEFAULT_PER_IP;
    const perKey = spam.perKeyPerMinute ?? DEFAULT_PER_KEY;
    if (await overRateLimit(ip, webhook.id, perIp, perKey)) {
      res.set('Retry-After', '60');
      res.status(429).json({ok: false, error: 'Too many submissions, please try again in a minute'});
      return;
    }

    if (webhook.hmacRequired) {
      if (!verifySignature(raw, cfg.hmacSecret || '', header(req, 'x-tigon-signature'))) {
        res.status(401).json({ok: false, error: 'Bad signature'});
        return;
      }
    }

    let parsed: Parsed;
    try {
      parsed = await parseBody(req);
    } catch (e) {
      logger.info('wh ingest: unreadable body', {webhookId: webhook.id, error: String(e)});
      res.status(400).json({ok: false, error: 'Could not read the form data'});
      return;
    }

    // Honeypot (skipped when that name is mapped to a real field, so it can't eat real data).
    const honeypot = (spam.honeypotField || 'website').trim();
    const honeypotActive = !!honeypot && !mapKey(honeypot, webhook.fieldMap);
    let spamReason = '';
    if (honeypotActive) {
      const hk = Object.keys(parsed.values).find((k) => k.toLowerCase() === honeypot.toLowerCase());
      if (hk && cleanValue(parsed.values[hk])) spamReason = 'Hidden honeypot field was filled in';
    }

    const {fields, extra} = mapFields(parsed.values, webhook.fieldMap, honeypotActive ? [honeypot] : []);
    const fileSlots = parsed.files.filter((f) => f.data.length);
    const meaningful = Object.entries(fields).some(([k, v]) =>
      v && (LEAD_FIELDS as readonly string[]).includes(k) && !['form_name', 'url'].includes(k)) || Object.keys(extra).length > 0;
    if (!meaningful && !fileSlots.length) {
      res.status(400).json({ok: false, error: 'Empty submission'});
      return;
    }

    // Server-side tracking values.
    fields.user_ip = ip;
    if (!fields.user_agent && header(req, 'user-agent')) fields.user_agent = cleanValue(header(req, 'user-agent')).slice(0, 500);
    if (!fields.referrer && header(req, 'referer')) fields.referrer = cleanValue(header(req, 'referer'));
    if (!fields.form_name) fields.form_name = webhook.formName || '';

    if (!spamReason && ipBlocked(ip, spam.blockedIps)) spamReason = 'Blocked IP address';
    if (!spamReason) {
      const hit = blockedWordHit([...Object.values(fields), ...Object.values(extra)], spam.blockedWords);
      if (hit) spamReason = `Blocked word: ${hit}`;
    }
    if (!spamReason && spam.turnstileSecret) {
      const token = cleanValue(parsed.values['cf-turnstile-response']);
      if (!token) spamReason = 'Missing Turnstile check';
      else if ((await verifyTurnstile(spam.turnstileSecret, token, ip)) === false) spamReason = 'Failed Turnstile check';
    }

    const ref = db().collection(WH.submissions).doc();
    const now = Date.now();
    const isSpam = !!spamReason;

    // Images (not for spam): known image fields first, then any other file fills the next free slot.
    const fileInfo: Array<Record<string, unknown>> = [];
    if (!isSpam) {
      const used = new Set(IMAGE_FIELDS.filter((f) => fields[f]));
      // Exact image_N names (or field-map entries) claim their slot first, then aliases (photo, image…), then anything else.
      const prio = (f: UploadIn) => {
        if ((IMAGE_FIELDS as readonly string[]).includes(f.field) || imageFieldFor(f.field, webhook.fieldMap) && webhook.fieldMap?.[f.field]) return 0;
        return imageFieldFor(f.field, webhook.fieldMap) ? 1 : 2;
      };
      const ordered = [...fileSlots].sort((a, b) => prio(a) - prio(b));
      for (const f of ordered) {
        const info: Record<string, unknown> = {field: f.field.slice(0, 100), name: f.filename.slice(0, 200), size: f.data.length};
        fileInfo.push(info);
        const kind = sniffImage(f.data);
        if (f.truncated) {
          info.rejected = 'Larger than 10 MB';
          continue;
        }
        if (!kind || (f.mime && !f.mime.startsWith('image/') && f.mime !== 'application/octet-stream')) {
          info.rejected = 'Not an image';
          continue;
        }
        let slot = imageFieldFor(f.field, webhook.fieldMap);
        if (!slot || used.has(slot as typeof IMAGE_FIELDS[number])) slot = IMAGE_FIELDS.find((x) => !used.has(x)) || null;
        if (!slot) {
          info.rejected = 'More than 3 images';
          continue;
        }
        used.add(slot as typeof IMAGE_FIELDS[number]);
        try {
          const up = await uploadImage(webhook.id, ref.id, slot, f.data, kind);
          fields[slot] = up.url;
          info.slot = slot;
          info.path = up.path;
        } catch (e) {
          logger.error('wh image upload failed', {webhookId: webhook.id, submissionId: ref.id, error: String(e)});
          info.rejected = 'Upload failed';
        }
      }
    } else {
      for (const f of fileSlots) fileInfo.push({field: f.field.slice(0, 100), name: f.filename.slice(0, 200), size: f.data.length, rejected: 'Spam'});
    }

    const rawFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.values).slice(0, 200)) {
      if (k.toLowerCase() === 'cf-turnstile-response' || k.toLowerCase() === 'g-recaptcha-response') continue;
      rawFields[k.slice(0, 100)] = cleanValue(v);
    }

    const doc: Record<string, unknown> = {
      ...fields,
      id: ref.id,
      webhookId: webhook.id,
      domainId: webhook.domainId || '',
      flowId: webhook.flowId || '',
      status: isSpam ? 'spam' : 'queued',
      isDuplicate: false,
      isSpam,
      rawPayload: {
        fields: rawFields,
        extra,
        files: fileInfo,
        contentType: header(req, 'content-type').split(';')[0].slice(0, 100),
      },
      receivedAt: now,
      cursor: isSpam ? null : {flow: 'webhook', index: 0},
      dedupeKeys: dedupeKeys(fields),
    };
    if (isSpam) doc.spamReason = spamReason;
    else doc.nextRunAt = now;

    await Promise.all([
      ref.set(doc),
      bumpStats(isSpam ? {total: 1, spam: 1} :
        {total: 1, domainId: webhook.domainId, webhookId: webhook.id, source: fields.utm_source || 'direct'}, now),
      isSpam ? Promise.resolve() : touchLastReceived(cfg, now),
    ]);
    if (isSpam) logger.info('wh ingest: spam', {webhookId: webhook.id, id: ref.id, spamReason});
    done(req, res, ref.id, settings);
  } catch (e) {
    logger.error('wh ingest failed', e);
    try {
      res.status(500).json({ok: false, error: 'Something went wrong, please try again'});
    } catch {
      // response already sent
    }
  }
}

export const whIngest = onRequest({memory: '512MiB', timeoutSeconds: 60}, async (req, res) => {
  await handleIngest(req as unknown as IngestReq, res as unknown as IngestRes);
});
