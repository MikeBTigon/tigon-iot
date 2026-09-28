// Webhook Flows — built-in steps: validate, dedupe, condition, delay, forward_to_master.
import {WH} from './types';
import type {StepType} from './types';
import type {StepHandler} from './engineTypes';
import {testCondition} from './shared';
import {db} from './config';
import {dedupeGroup, dedupeValue, DEDUPE_INDEXED, isEmail} from './fields';

/** Internal `next` value: jump to the Master Flow. */
export const NEXT_MASTER = '__master__';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** Missing required fields + format problems ('' = valid). */
export function validationError(sub: Record<string, unknown>, required: string[]): string {
  const missing = required.filter((f) => !str(sub[f]).trim());
  const problems: string[] = [];
  if (missing.length) problems.push('Missing required: ' + missing.join(', '));
  const email = str(sub.email).trim();
  if (email && !isEmail(email)) problems.push('Invalid email address');
  for (const f of ['phone1', 'phone2']) {
    const p = str(sub[f]).trim();
    if (!p) continue;
    const digits = p.replace(/\D/g, '').length;
    if (digits < 7 || digits > 15 || /[a-z]{3,}/i.test(p.replace(/ext\.?|x/gi, ''))) problems.push(`Invalid phone number (${f})`);
  }
  return problems.join('; ');
}

const validate: StepHandler = async (ctx) => {
  const required = list(ctx.step.config.required).length ? list(ctx.step.config.required) : ctx.settings.requiredFields || [];
  const err = validationError(ctx.submission as unknown as Record<string, unknown>, required);
  if (err) return {status: 'failed', error: err, retryable: false, next: 'stop', response: {required}};
  return {status: 'success', response: {checked: required}};
};

const dedupe: StepHandler = async (ctx) => {
  const sub = ctx.submission as unknown as Record<string, unknown>;
  const cfgMatch = list(ctx.step.config.matchOn);
  const matchOn = cfgMatch.length ? cfgMatch : ctx.settings.dedupeMatchOn?.length ? ctx.settings.dedupeMatchOn : ['email', 'phone1'];
  const hours = Number(ctx.step.config.windowHours) || ctx.settings.dedupeWindowHours || 24;
  const windowStart = ctx.submission.receivedAt - hours * 3_600_000;
  const acrossDomains = ctx.flowKind === 'master' || ctx.step.config.scope === 'all_sites';
  const matches = new Map<string, {id: string; receivedAt: number; field: string}>();
  const col = db().collection(WH.submissions);

  for (const field of matchOn) {
    const value = dedupeValue(field, sub[field]);
    if (!value) continue;
    const q = DEDUPE_INDEXED.includes(field) ?
      col.where('dedupeKeys', 'array-contains', dedupeGroup(field) + ':' + value).limit(50) :
      col.where(field, '==', sub[field]).limit(50);
    const snap = await q.get();
    for (const d of snap.docs) {
      if (d.id === ctx.submission.id) continue;
      const o = d.data();
      if (o.isSpam || o.isTest || o.status === 'failed' || o.status === 'spam') continue;
      if (!acrossDomains && o.domainId !== ctx.submission.domainId) continue;
      const at = Number(o.receivedAt || 0);
      // Only earlier submissions count (ties broken by id), inside the window.
      if (at < windowStart || at > ctx.submission.receivedAt) continue;
      if (at === ctx.submission.receivedAt && d.id > ctx.submission.id) continue;
      if (dedupeValue(field, o[field]) !== value && !DEDUPE_INDEXED.includes(field)) continue;
      matches.set(d.id, {id: d.id, receivedAt: at, field});
    }
  }
  if (!matches.size) return {status: 'success', response: {duplicate: false, matchOn, windowHours: hours}};
  const latest = Array.from(matches.values()).sort((a, b) => b.receivedAt - a.receivedAt)[0];
  if (ctx.submission.isTest) {
    // Test sends always run the whole flow; just report what dedupe would have done.
    return {status: 'success', response: {duplicate: true, test: true, wouldStop: ctx.step.config.onDuplicate !== 'continue', duplicateOf: latest.id}};
  }
  const stop = ctx.step.config.onDuplicate !== 'continue';
  return {
    status: 'success',
    outcome: 'duplicate',
    patch: {isDuplicate: true, duplicateOf: latest.id},
    next: stop ? 'stop' : undefined,
    response: {duplicate: true, duplicateOf: latest.id, matchedOn: latest.field, matches: matches.size},
  };
};

const condition: StepHandler = async (ctx) => {
  const c = ctx.step.config;
  const field = str(c.field);
  const sub = ctx.submission as unknown as Record<string, unknown>;
  const extra = ((sub.rawPayload as Record<string, unknown> | undefined)?.extra || {}) as Record<string, unknown>;
  const value = sub[field] !== undefined ? sub[field] : extra[field];
  const result = testCondition(value, str(c.op) || '==', c.value);
  const target = str(result ? c.then : c.else) || 'continue';
  return {status: 'success', next: target, response: {result, field, next: target}};
};

const delay: StepHandler = async (ctx) => {
  const minutes = Number(ctx.step.config.minutes) || 0;
  if (minutes <= 0) return {status: 'skipped', response: {minutes: 0}};
  const waitUntil = Date.now() + Math.min(minutes, 60 * 24 * 30) * 60_000;
  return {status: 'success', waitUntil, response: {minutes, until: waitUntil}};
};

const forwardToMaster: StepHandler = async () => ({status: 'success', next: NEXT_MASTER, response: {forwarded: true}});

export const CORE_STEPS: Partial<Record<StepType, StepHandler>> = {
  validate,
  dedupe,
  condition,
  delay,
  forward_to_master: forwardToMaster,
};
