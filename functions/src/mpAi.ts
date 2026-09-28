// Tigon MP Assistant — AI listing writer (Facebook Marketplace vehicle listings).
// Callable: mpAiListing({cart, photoUrl?, tone?}) -> {title, description, priceNote}.
// Requires the ANTHROPIC_API_KEY secret (firebase functions:secrets:set ANTHROPIC_API_KEY).
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-opus-5';
const USERS = 'mp_users';
const TITLE_MAX = 60;

type Tone = 'friendly' | 'professional' | 'short';
const TONES: Tone[] = ['friendly', 'professional', 'short'];

interface CartFacts {
  make: string;
  model: string;
  year: string;
  color: string;
  seatColor: string;
  passengers: number | null;
  isUsed: boolean | null;
  isElectric: boolean | null;
  batteryType: string;
  packVoltage: string;
  isLifted: boolean | null;
  isStreetLegal: boolean | null;
  hasSoundSystem: boolean | null;
  hasExtendedTop: boolean | null;
  hasHitch: boolean | null;
  tireRimSize: string;
  tireType: string;
  driveTrain: string;
  price: number | null;
  cartWarranty: string;
  batteryWarranty: string;
  location: string;
}

export interface AiListingResult {
  title: string;
  description: string;
  priceNote: string;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Trim, collapse whitespace, strip control chars, cap length. */
function cleanStr(v: unknown, max = 60): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const cleanBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

function cleanNum(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function cleanCart(raw: unknown): CartFacts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'cart is required.');
  }
  const c = raw as Record<string, unknown>;
  const price = cleanNum(c.price, 0, 1_000_000);
  const passengers = cleanNum(c.passengers, 0, 20);
  const facts: CartFacts = {
    make: cleanStr(c.make, 40),
    model: cleanStr(c.model, 60),
    year: cleanStr(c.year, 4).replace(/[^0-9]/g, ''),
    color: cleanStr(c.color, 40),
    seatColor: cleanStr(c.seatColor, 40),
    passengers: passengers && passengers > 0 ? Math.round(passengers) : null,
    isUsed: cleanBool(c.isUsed),
    isElectric: cleanBool(c.isElectric),
    batteryType: cleanStr(c.batteryType, 40),
    packVoltage: cleanStr(c.packVoltage, 20),
    isLifted: cleanBool(c.isLifted),
    isStreetLegal: cleanBool(c.isStreetLegal),
    hasSoundSystem: cleanBool(c.hasSoundSystem),
    hasExtendedTop: cleanBool(c.hasExtendedTop),
    hasHitch: cleanBool(c.hasHitch),
    tireRimSize: cleanStr(c.tireRimSize, 20),
    tireType: cleanStr(c.tireType, 40),
    driveTrain: cleanStr(c.driveTrain, 20),
    price: price && price > 0 ? Math.round(price) : null,
    cartWarranty: cleanStr(c.cartWarranty, 80),
    batteryWarranty: cleanStr(c.batteryWarranty, 80),
    location: cleanStr(c.location, 60),
  };
  if (!facts.make && !facts.model) {
    throw new HttpsError('invalid-argument', 'cart.make or cart.model is required.');
  }
  return facts;
}

/** Only https URLs on s3.amazonaws.com are passed to the model; anything else is ignored. */
function cleanPhotoUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' || u.hostname !== 's3.amazonaws.com') return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You write Facebook Marketplace vehicle listings for golf carts sold by a dealership.

Output a JSON object with three fields:
- "title": at most ${TITLE_MAX} characters. Year, make, model, and one or two standout facts (for example color, seats, lifted, street legal). No emojis, no all-caps words, no punctuation spam.
- "description": plain text only. No markdown (no asterisks, no "#", no bold), no emojis, no hashtags. Short lines or short paragraphs separated by newlines; simple "- " dashes are fine for a feature list.
- "priceNote": one short sentence of pricing context for the salesperson, based only on the given price and the given cart facts (for example that the price includes the listed warranty). Never invent or imply market data, comparisons, averages, discounts, or "below market" claims. Use an empty string if there is nothing factual to say or no price is given.

Accuracy rules (most important):
- Use only the facts provided in the cart data. Never invent features, accessories, mileage, hours, battery age, condition details, service history, or ownership history.
- A fact that is missing, empty, or null is unknown: leave it out entirely. Do not say it is absent.
- If a photo is attached, you may describe what is clearly visible (body color, seat color, wheels/tires, top, general look). Do not claim anything that is not both visible and consistent with the cart data; if the photo and the cart data disagree, trust the cart data.
- Mention cart warranty or battery warranty only when a warranty value is provided, using its wording.
- Include exactly one line saying financing is available and exactly one line saying delivery is available. Do not state rates, terms, prices, or distances for either.
- Do not include any company, dealership, or brand name other than the cart's make. Do not include phone numbers, URLs, or email addresses.
- The description's final line must be exactly the location in the form "City, ST" as provided, with nothing after it. If no location is provided, end with the delivery line.`;

const TONE_GUIDE: Record<Tone, string> = {
  friendly: 'Tone: warm and upbeat, conversational, like a helpful local seller. About 80-140 words.',
  professional: 'Tone: clear, polished, and factual, like a dealership spec sheet with a short intro. About 80-140 words.',
  short: 'Tone: brief and scannable. A one-line intro, a short feature list, then the required lines. Under 70 words.',
};

function factsForPrompt(c: CartFacts): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const add = (k: string, v: string | number | boolean | null) => {
    if (v === null || v === '') return;
    out[k] = v;
  };
  add('year', c.year);
  add('make', c.make);
  add('model', c.model);
  add('condition', c.isUsed === null ? null : c.isUsed ? 'used' : 'new');
  add('color', c.color);
  add('seatColor', c.seatColor);
  add('passengers', c.passengers);
  add('powertrain', c.isElectric === null ? null : c.isElectric ? 'electric' : 'gas');
  add('batteryType', c.batteryType);
  add('packVoltage', c.packVoltage);
  add('driveTrain', c.driveTrain);
  add('lifted', c.isLifted);
  add('streetLegal', c.isStreetLegal);
  add('soundSystem', c.hasSoundSystem);
  add('extendedTop', c.hasExtendedTop);
  add('hitch', c.hasHitch);
  add('tireRimSize', c.tireRimSize);
  add('tireType', c.tireType);
  add('priceUSD', c.price);
  add('cartWarranty', c.cartWarranty);
  add('batteryWarranty', c.batteryWarranty);
  add('location', c.location);
  return out;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: {type: 'string'},
    description: {type: 'string'},
    priceNote: {type: 'string'},
  },
  required: ['title', 'description', 'priceNote'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Output parsing / sanitizing
// ---------------------------------------------------------------------------

// Built via RegExp so the functions tsconfig (target es2017) accepts the `u`-flag property escape.
const EMOJI_RE = new RegExp('[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}]', 'gu');

function plain(s: string): string {
  return s
    .replace(EMOJI_RE, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function capTitle(s: string): string {
  const t = plain(s).replace(/\s+/g, ' ');
  if (t.length <= TITLE_MAX) return t;
  const cut = t.slice(0, TITLE_MAX + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > 30 ? cut.slice(0, sp) : t.slice(0, TITLE_MAX)).replace(/[\s,;:\-|]+$/, '');
}

function parseResult(text: string): AiListingResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      obj = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.title !== 'string' || typeof o.description !== 'string') return null;
  return {
    title: o.title,
    description: o.description,
    priceNote: typeof o.priceNote === 'string' ? o.priceNote : '',
  };
}

function finalize(r: AiListingResult, location: string): AiListingResult {
  let description = plain(r.description);
  if (location) {
    const lines = description.split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length && lines[lines.length - 1].trim() === location) lines.pop();
    description = `${lines.join('\n').trim()}\n\n${location}`;
  }
  return {
    title: capTitle(r.title),
    description: description.slice(0, 5000),
    priceNote: plain(r.priceNote).replace(/\s+/g, ' ').slice(0, 300),
  };
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

async function generate(client: Anthropic, facts: CartFacts, tone: Tone, photoUrl: string | null) {
  const text =
    `${TONE_GUIDE[tone]}\n\nCart data (JSON; the only facts you may state):\n` +
    JSON.stringify(factsForPrompt(facts), null, 2) +
    (photoUrl ? '\n\nThe attached photo is of this cart.' : '\n\nNo photo is attached.');

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (photoUrl) content.push({type: 'image', source: {type: 'url', url: photoUrl}});
  content.push({type: 'text', text});

  return client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Short, well-specified writing task: low effort keeps latency and cost down.
    output_config: {effort: 'low', format: {type: 'json_schema', schema: OUTPUT_SCHEMA}},
    // Server-side refusal fallback (routes a declined request to a fallback model).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{role: 'user', content}],
  });
}

function extract(msg: Anthropic.Beta.BetaMessage): AiListingResult | null {
  if (msg.stop_reason === 'refusal') {
    throw new HttpsError('aborted', 'The AI declined to write this listing. Try again or write it manually.');
  }
  if (msg.stop_reason === 'max_tokens') return null;
  const text = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return text ? parseResult(text) : null;
}

export const mpAiListing = onCall(
  {secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB'},
  async (req): Promise<AiListingResult> => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const uid = req.auth.uid;
    const userDoc = await admin.firestore().collection(USERS).doc(uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'MP Assistant access required.');

    const data = (req.data || {}) as Record<string, unknown>;
    const facts = cleanCart(data.cart);
    const tone: Tone = TONES.includes(data.tone as Tone) ? (data.tone as Tone) : 'friendly';
    let photoUrl = cleanPhotoUrl(data.photoUrl);

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'AI writer is not configured (missing ANTHROPIC_API_KEY).');
    }
    const client = new Anthropic({apiKey, timeout: 45_000, maxRetries: 1});

    let result: AiListingResult | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        result = extract(await generate(client, facts, tone, photoUrl));
        if (!result) logger.warn('mpAiListing: unparseable model output', {uid, attempt});
      } catch (e) {
        if (e instanceof HttpsError) throw e;
        if (e instanceof Anthropic.BadRequestError && photoUrl) {
          // Most likely the image URL could not be fetched; retry text-only.
          logger.warn('mpAiListing: bad request with photo, retrying without it', {uid, message: e.message});
          photoUrl = null;
          continue;
        }
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
          logger.error('mpAiListing: Anthropic auth error', {status: e.status});
          throw new HttpsError('failed-precondition', 'AI writer is not configured (invalid ANTHROPIC_API_KEY).');
        }
        if (e instanceof Anthropic.RateLimitError) {
          throw new HttpsError('resource-exhausted', 'AI writer is busy. Try again in a minute.');
        }
        if (e instanceof Anthropic.APIError) {
          logger.error('mpAiListing: Anthropic API error', {status: e.status, message: e.message});
          throw new HttpsError('unavailable', 'AI writer is temporarily unavailable. Try again.');
        }
        logger.error('mpAiListing: unexpected error', e);
        throw new HttpsError('internal', 'AI writer failed. Try again.');
      }
    }
    if (!result) throw new HttpsError('internal', 'AI writer returned an unreadable response. Try again.');

    logger.info('mpAiListing: ok', {uid, tone, photo: !!photoUrl});
    return finalize(result, facts.location);
  },
);
