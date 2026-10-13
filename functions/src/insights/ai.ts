// Insights — AI help (same setup as the AI listing writer in ../mpAi.ts: ANTHROPIC_API_KEY secret, same model,
// exported only when ENABLE_AI_WRITER=true).
//   mpAiAssist  callable (team) {mode, …}
//     'reply'      {messages: [{dir:'in'|'out', body, at}], lead: {name, status, cartTitle, store}, cart: {title, price}}
//                  → {text}  a short friendly SMS reply draft
//     'summary'    {text}  → {bullets: [string, string]}
//     'post_picks' {carts: [{id, title, price, days, posts, store}]} → {picks: [{id, reason}]} (top 5 to post today)
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import Anthropic from '@anthropic-ai/sdk';
import {callerOf} from './people';

// Secret referenced by name (not defineSecret), like mpAi.ts, so loading this file never looks the secret up.
const ANTHROPIC_SECRET = 'ANTHROPIC_API_KEY';
// Same model as the AI listing writer (functions/src/mpAi.ts).
const MODEL = 'claude-opus-5';

type Mode = 'reply' | 'summary' | 'post_picks';

const clip = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

interface Task {system: string; user: string; schema: Record<string, unknown>}

/** Validated prompt for a mode (exported for tests). */
export function buildTask(mode: Mode, d: Record<string, unknown>): Task {
  if (mode === 'reply') {
    const msgs = (Array.isArray(d.messages) ? d.messages : []).slice(-20).map((m) => {
      const o = (m || {}) as Record<string, unknown>;
      return {from: o.dir === 'in' ? 'customer' : 'us', text: clip(o.body, 600)};
    }).filter((m) => m.text);
    if (!msgs.length) throw new HttpsError('invalid-argument', 'There are no messages to reply to yet.');
    const lead = (d.lead || {}) as Record<string, unknown>;
    const cart = (d.cart || {}) as Record<string, unknown>;
    const facts = {
      customerName: clip(lead.name, 60), leadStatus: clip(lead.status, 20), cartOfInterest: clip(lead.cartTitle || cart.title, 120),
      cartPrice: num(cart.price), store: clip(lead.store, 60), salesperson: clip(d.salesperson, 40),
    };
    return {
      system: 'You draft SMS replies for a golf cart dealership salesperson. Write ONE short, friendly, plain-text text message ' +
        '(under 300 characters) answering the customer\'s latest message. Use only the facts given; never invent prices, availability, ' +
        'financing terms, discounts or delivery times — if unsure, offer to check and get back to them, or invite them to call or visit. ' +
        'No emojis, no links, no hashtags. Sign off with the salesperson\'s first name if given.',
      user: `Facts (JSON): ${JSON.stringify(facts)}\n\nConversation (oldest first, JSON): ${JSON.stringify(msgs)}`,
      schema: {type: 'object', properties: {text: {type: 'string'}}, required: ['text'], additionalProperties: false},
    };
  }
  if (mode === 'summary') {
    const text = clip(d.text, 12000);
    if (text.length < 20) throw new HttpsError('invalid-argument', 'There is not enough text to summarize.');
    return {
      system: 'You summarize customer messages for a golf cart salesperson. Return exactly 2 short bullet points (plain text, ' +
        'no leading dashes): 1) what the customer wants / asked, 2) the next step for the salesperson. Use only what the text says.',
      user: text,
      schema: {type: 'object', properties: {bullets: {type: 'array', items: {type: 'string'}}}, required: ['bullets'], additionalProperties: false},
    };
  }
  if (mode === 'post_picks') {
    const carts = (Array.isArray(d.carts) ? d.carts : []).slice(0, 60).map((c) => {
      const o = (c || {}) as Record<string, unknown>;
      return {id: clip(o.id, 80), title: clip(o.title, 120), price: num(o.price), daysInStock: num(o.days), timesPosted: num(o.posts), store: clip(o.store, 40), photos: num(o.photos)};
    }).filter((c) => c.id && c.title);
    if (!carts.length) throw new HttpsError('invalid-argument', 'No carts to choose from.');
    return {
      system: 'You help a golf cart dealership decide which carts to post on Facebook Marketplace today. From the list, pick the 5 ' +
        'best carts to post (fewer if the list is shorter). Favor carts that have been in stock longest, were posted the least, have photos, ' +
        'and are priced attractively; spread picks across stores when it makes sense. Give each a one-line plain-English reason (under 90 characters). ' +
        'Only use ids from the list.',
      user: `Carts (JSON): ${JSON.stringify(carts)}`,
      schema: {
        type: 'object', additionalProperties: false, required: ['picks'],
        properties: {picks: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['id', 'reason'],
          properties: {id: {type: 'string'}, reason: {type: 'string'}}}}},
      },
    };
  }
  throw new HttpsError('invalid-argument', 'Unknown AI request.');
}

function parse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
}

/** Shapes the model output for the client (exported for tests). */
export function shape(mode: Mode, o: Record<string, unknown>, d: Record<string, unknown>): Record<string, unknown> {
  const plain = (s: unknown, max: number) => clip(s, max).replace(/\*\*|__|`/g, '').replace(/^[-•*]\s*/, '');
  if (mode === 'reply') return {text: plain(o.text, 480)};
  if (mode === 'summary') return {bullets: (Array.isArray(o.bullets) ? o.bullets : []).slice(0, 2).map((b) => plain(b, 240)).filter(Boolean)};
  const ids = new Set((Array.isArray(d.carts) ? d.carts : []).map((c) => clip((c as Record<string, unknown>)?.id, 80)));
  const seen = new Set<string>();
  const picks = (Array.isArray(o.picks) ? o.picks : []).map((p) => p as Record<string, unknown>)
    .map((p) => ({id: clip(p.id, 80), reason: plain(p.reason, 140)}))
    .filter((p) => ids.has(p.id) && !seen.has(p.id) && seen.add(p.id)).slice(0, 5);
  return {picks};
}

export const mpAiAssist = onCall(
  {secrets: [ANTHROPIC_SECRET], timeoutSeconds: 60, memory: '256MiB'},
  async (req) => {
    const me = await callerOf(req);
    const d = (req.data || {}) as Record<string, unknown>;
    const mode = String(d.mode || '') as Mode;
    const task = buildTask(mode, d);
    const apiKey = process.env[ANTHROPIC_SECRET] || '';
    if (!apiKey) throw new HttpsError('failed-precondition', 'AI help is not configured (missing ANTHROPIC_API_KEY).');
    const client = new Anthropic({apiKey, timeout: 45_000, maxRetries: 1});
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2000,
        output_config: {effort: 'low', format: {type: 'json_schema', schema: task.schema}},
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: task.system,
        messages: [{role: 'user', content: task.user}],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new HttpsError('failed-precondition', 'AI help is not configured (invalid ANTHROPIC_API_KEY).');
      }
      if (e instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', 'AI is busy. Try again in a minute.');
      logger.error('mpAiAssist: API error', {mode, message: (e as Error).message});
      throw new HttpsError('unavailable', 'AI is temporarily unavailable. Try again.');
    }
    if (msg.stop_reason === 'refusal') throw new HttpsError('aborted', 'The AI declined this one. Please write it yourself.');
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    const o = text ? parse(text) : null;
    if (!o) throw new HttpsError('internal', 'The AI returned an unreadable answer. Try again.');
    logger.info('mpAiAssist ok', {uid: me.uid, mode});
    return shape(mode, o, d);
  },
);
