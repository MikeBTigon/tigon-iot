// Phone online-hours analytics (Users page): daily "under the minimum" alerts, weekly per-user emails and on-demand reports.
//   mpPresenceDaily   07:05 New York — phones that were online less than the minimum (default 8 h) yesterday:
//                     push + note to the phone's user, alert to managers (System Triage)
//   mpPresenceWeekly  Fridays 17:00 New York — one email per user to the report address (default iot@tigongolfcarts.com)
//   mpPresenceReport  callable (manager) — {action: 'user', uid} | {action: 'allUsers'} | {action: 'overall'} send now;
//                     {action: 'settings', minHours, days} saves the minimum and which weekdays count
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {ONLINE, SLOTS_PER_DAY, SLOT_MIN, TZ, hoursOf, nySlot} from './presence';
import {sendMail} from './wh/steps/email';
import type {WhSettings} from './wh/types';

const db = () => admin.firestore();
const SETTINGS_DOC = 'mp_meta/presence';
const DEFAULT_TO = 'iot@tigongolfcarts.com';
const LOCATIONS: Record<string, string> = {
  T0: 'TIGON National', T1: 'Hatfield PA', T2: 'Ocean View NJ', T3: 'Long Pond PA', T4: 'Dover DE', T5: 'Scranton-Wilkes-Barre PA',
  T6: 'Raleigh NC', T7: 'South Bend IN', T8: 'Gloucester Point VA', T9: 'Bayville NJ', T10: 'Waretown NJ', T11: 'Orangeburg SC',
};

export interface PresenceSettings {minHours: number; days: number[]; reportTo: string}
interface Phone {id: string; userId: string; name: string; number: string; location: string; lastSeen: number}
interface Person {uid: string; name: string; email: string; location: string}
type Online = Map<string, Map<string, Record<string, unknown>>>; // deviceId → date → slots

export async function presenceSettings(): Promise<PresenceSettings> {
  const s = (await db().doc(SETTINGS_DOC).get()).data() || {};
  const minHours = Number(s.minHours);
  return {
    minHours: Number.isFinite(minHours) && minHours > 0 ? minHours : 8,
    days: Array.isArray(s.days) && s.days.length ? s.days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
    reportTo: typeof s.reportTo === 'string' && s.reportTo.includes('@') ? s.reportTo : DEFAULT_TO,
  };
}

// ---- dates (New York calendar days as YYYY-MM-DD) ----
const today = () => nySlot(Date.now()).date;
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const range = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC'});

// ---- data ----
async function loadPeople(): Promise<Map<string, Person>> {
  const snap = await db().collection('mp_users').get();
  return new Map(snap.docs.map((d) => [d.id, {
    uid: d.id, name: String(d.get('name') || d.get('email') || d.id), email: String(d.get('email') || ''), location: String(d.get('location') || ''),
  }]));
}

async function loadPhones(): Promise<Phone[]> {
  const snap = await db().collection('devices').where('source', '==', 'tigon-iot-app').get();
  return snap.docs.filter((d) => d.get('status') !== 'revoked').map((d) => ({
    id: d.id, userId: String(d.get('userId') || ''), name: String(d.get('deviceName') || 'Phone'),
    number: String(d.get('deviceNumber') || ''), location: String(d.get('locationId') || ''), lastSeen: Number(d.get('lastSeen') || 0),
  }));
}

async function loadOnline(from: string): Promise<Online> {
  const out: Online = new Map();
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db().collection(ONLINE).where('date', '>=', from).orderBy('date').limit(5000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) {
      const dev = String(d.get('deviceId'));
      if (!out.has(dev)) out.set(dev, new Map());
      out.get(dev)!.set(String(d.get('date')), (d.get('slots') || {}) as Record<string, unknown>);
    }
    if (snap.size < 5000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/** Marketplace postings: '<userId>|<deviceId or web>' → date → count (post_marked events + posted queue items without one). */
type Posts = Map<string, Map<string, number>>;
const NO_POSTS: Posts = new Map();

async function loadPosts(from: string): Promise<Posts> {
  const fromMs = Date.parse(`${from}T00:00:00-05:00`);
  const [events, queue] = await Promise.all([
    db().collection('mp_events').where('type', '==', 'post_marked').get(),
    db().collection('mp_queue').where('status', '==', 'posted').get(),
  ]);
  const out: Posts = new Map();
  const add = (uid: string, device: string, ts: number) => {
    if (!ts || ts < fromMs) return;
    const key = `${uid}|${device || 'web'}`;
    const date = nySlot(ts).date;
    if (!out.has(key)) out.set(key, new Map());
    out.get(key)!.set(date, (out.get(key)!.get(date) || 0) + 1);
  };
  const seen = new Set<string>();
  for (const e of events.docs) {
    if (e.get('queueId')) seen.add(String(e.get('queueId')));
    add(String(e.get('userId') || ''), String(e.get('deviceId') || ''), Number(e.get('ts') || 0));
  }
  for (const q of queue.docs) {
    if (seen.has(q.id)) continue;
    add(String(q.get('assignedUserId') || ''), String(q.get('deviceId') || ''), Number(q.get('postedAt') || q.get('updatedAt') || 0));
  }
  return out;
}
const postsFor = (ps: Posts, uid: string, device: string, dates: string[]) => {
  const m = ps.get(`${uid}|${device}`);
  return m ? dates.reduce((s, d) => s + (m.get(d) || 0), 0) : 0;
};

const hours = (o: Online, dev: string, date: string) => hoursOf(o.get(dev)?.get(date));
const sumHours = (o: Online, dev: string, dates: string[]) => dates.reduce((s, d) => s + hours(o, dev, d), 0);
const fmt = (h: number) => (h >= 10 ? h.toFixed(0) : h.toFixed(1));
const phoneLabel = (p: Phone) => `${p.number ? `#${p.number} ` : ''}${p.name}${p.location ? ` · ${LOCATIONS[p.location] || p.location}` : ''}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c] as string));

interface Periods {t: string; last7: string[]; week: string[]; month: string[]; year: string[]}
function periods(t = today()): Periods {
  const wd = weekday(t);
  return {
    t,
    last7: range(addDays(t, -6), t),
    week: range(addDays(t, -((wd + 6) % 7)), t), // Monday → today
    month: range(`${t.slice(0, 8)}01`, t),
    year: range(`${t.slice(0, 5)}01-01`, t),
  };
}

// ---- email HTML ----
const TD = 'padding:4px 6px;border:1px solid #ddd;font-size:12px;text-align:center';
const TH = `${TD};background:#f3f3f3;font-weight:600`;

/** 24 cells: share of each hour the phone was online on that day. */
function hourStrip(slots: Record<string, unknown> | undefined) {
  let cells = '';
  for (let h = 0; h < 24; h++) {
    let on = 0;
    for (let s = h * (60 / SLOT_MIN); s < (h + 1) * (60 / SLOT_MIN); s++) if (slots?.[String(s)]) on++;
    const f = on / (60 / SLOT_MIN);
    const bg = f === 0 ? '#eeeeee' : f < 0.5 ? '#a5d6a7' : '#2e7d32';
    cells += `<td title="${h}:00" style="width:12px;height:14px;padding:0;background:${bg};border:1px solid #fff"></td>`;
  }
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

/** Hour labels above the 24 hour cells. */
function hourLabels() {
  let cells = '';
  for (let h = 0; h < 24; h++) cells += `<td style="width:12px;padding:0;font-size:9px;color:#888;text-align:left;border:1px solid #fff">${h % 6 === 0 ? String(h).padStart(2, '0') : ''}</td>`;
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

function phoneSection(p: Phone, o: Online, per: Periods, cfg: PresenceSettings, ps: Posts = NO_POSTS) {
  const posts = (dates: string[]) => postsFor(ps, p.userId, p.id, dates);
  // Today is still running: it is shown but never counted as "under".
  const counts = (d: string) => cfg.days.includes(weekday(d)) && d !== per.t;
  const under = per.month.filter((d) => counts(d) && hours(o, p.id, d) < cfg.minHours).length;
  const monthDays = per.month.filter(counts).length || 1;
  const avgMonth = sumHours(o, p.id, per.month.filter(counts)) / monthDays;
  let rows = '';
  for (const d of per.last7) {
    const h = hours(o, p.id, d);
    const low = counts(d) && h < cfg.minHours;
    rows += `<tr><td style="${TD};text-align:left;white-space:nowrap">${label(d)}</td>` +
      `<td style="${TD};font-weight:600;color:${low ? '#c62828' : '#2e7d32'}">${fmt(h)} h${low ? ' ⚠' : ''}</td>` +
      `<td style="${TD}">${posts([d])}</td><td style="${TD}">${hourStrip(o.get(p.id)?.get(d))}</td></tr>`;
  }
  return `<h3 style="margin:18px 0 6px;font-size:15px">${esc(phoneLabel(p))}</h3>
<table cellspacing="0" style="border-collapse:collapse;margin-bottom:6px"><tr>
<th style="${TH}">This week</th><th style="${TH}">This month</th><th style="${TH}">This year</th><th style="${TH}">Avg / day (month)</th><th style="${TH}">Days under ${cfg.minHours} h (month)</th>
<th style="${TH}">Posts this week</th><th style="${TH}">Posts this month</th><th style="${TH}">Posts this year</th></tr>
<tr><td style="${TD}">${fmt(sumHours(o, p.id, per.week))} h</td><td style="${TD}">${fmt(sumHours(o, p.id, per.month))} h</td>
<td style="${TD}">${fmt(sumHours(o, p.id, per.year))} h</td><td style="${TD};color:${avgMonth < cfg.minHours ? '#c62828' : '#2e7d32'}">${fmt(avgMonth)} h</td>
<td style="${TD};color:${under ? '#c62828' : '#2e7d32'};font-weight:600">${under}</td>
<td style="${TD};font-weight:600">${posts(per.week)}</td><td style="${TD};font-weight:600">${posts(per.month)}</td><td style="${TD};font-weight:600">${posts(per.year)}</td></tr></table>
<table cellspacing="0" style="border-collapse:collapse"><tr><th style="${TH}">Day</th><th style="${TH}">Online</th><th style="${TH}">Posts</th><th style="${TH}">When (midnight → midnight, New York time)</th></tr>
<tr><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}">${hourLabels()}</td></tr>${rows}</table>`;
}

const wrap = (title: string, body: string, cfg: PresenceSettings) => `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px">
<h2 style="color:#b01e2f;margin:0 0 4px">${esc(title)}</h2>
<p style="margin:0 0 10px;color:#555;font-size:13px">Every phone should be online at least <b>${cfg.minHours} hours</b> a day. Green squares = hours the phone was on.
Open <a href="https://tigoniot.com/users">tigoniot.com/users</a> for the full timeline.</p>${body}
<p style="color:#999;font-size:11px;margin-top:18px">Sent by TIGON IOT.</p></div>`;

function userReport(person: Person, phones: Phone[], o: Online, per: Periods, cfg: PresenceSettings, ps: Posts = NO_POSTS) {
  const own = phones.filter((p) => p.userId === person.uid);
  const total = own.reduce((s, p) => s + sumHours(o, p.id, per.week), 0);
  // All of the person's postings (any device, incl. computer and phones they no longer have).
  const allPosts = (dates: string[]) => Array.from(ps.keys()).filter((k) => k.startsWith(`${person.uid}|`))
    .reduce((s, k) => s + postsFor(ps, person.uid, k.slice(person.uid.length + 1), dates), 0);
  const otherPosts = (dates: string[]) => allPosts(dates) - own.reduce((s, p) => s + postsFor(ps, person.uid, p.id, dates), 0);
  const postTable = `<h3 style="margin:18px 0 6px;font-size:15px">Marketplace postings</h3>
<table cellspacing="0" style="border-collapse:collapse"><tr><th style="${TH}">Device</th><th style="${TH}">Today</th><th style="${TH}">This week</th><th style="${TH}">This month</th><th style="${TH}">This year</th></tr>
${own.map((p) => `<tr><td style="${TD};text-align:left">${esc(phoneLabel(p))}</td>${[[per.t], per.week, per.month, per.year].map((ds) => `<td style="${TD}">${postsFor(ps, person.uid, p.id, ds)}</td>`).join('')}</tr>`).join('')}
${otherPosts(per.year) ? `<tr><td style="${TD};text-align:left">Computer / other devices</td>${[[per.t], per.week, per.month, per.year].map((ds) => `<td style="${TD}">${otherPosts(ds)}</td>`).join('')}</tr>` : ''}
<tr><td style="${TD};text-align:left;font-weight:700">All devices</td>${[[per.t], per.week, per.month, per.year].map((ds) => `<td style="${TD};font-weight:700">${allPosts(ds)}</td>`).join('')}</tr></table>`;
  const body = (own.length ? own.map((p) => phoneSection(p, o, per, cfg, ps)).join('') : '<p>No phones are set up for this person.</p>') + postTable;
  const title = `Phone online report — ${person.name}`;
  return {
    subject: `${title} (week of ${label(per.week[0])})`,
    html: wrap(title, `<p style="font-size:13px">${own.length} phone(s) · ${fmt(total)} h online this week · ${allPosts(per.week)} posting(s) this week${person.location ? ` · ${esc(LOCATIONS[person.location] || person.location)}` : ''}</p>${body}`, cfg),
    text: `${title}\n` + own.map((p) => `${phoneLabel(p)}: week ${fmt(sumHours(o, p.id, per.week))} h, month ${fmt(sumHours(o, p.id, per.month))} h, year ${fmt(sumHours(o, p.id, per.year))} h; posts week ${postsFor(ps, person.uid, p.id, per.week)}, month ${postsFor(ps, person.uid, p.id, per.month)}, year ${postsFor(ps, person.uid, p.id, per.year)}`).join('\n') +
      `\nAll postings: week ${allPosts(per.week)}, month ${allPosts(per.month)}, year ${allPosts(per.year)}`,
  };
}

function overallReport(people: Map<string, Person>, phones: Phone[], o: Online, per: Periods, cfg: PresenceSettings, ps: Posts = NO_POSTS) {
  const counts = (d: string) => cfg.days.includes(weekday(d)) && d !== per.t;
  const sorted = phones.slice().sort((a, b) => (people.get(a.userId)?.name || '').localeCompare(people.get(b.userId)?.name || '') || a.number.localeCompare(b.number));
  let rows = '';
  const lines: string[] = [];
  for (const p of sorted) {
    const who = people.get(p.userId)?.name || 'Unknown';
    const under7 = per.last7.filter((d) => counts(d) && hours(o, p.id, d) < cfg.minHours).length;
    const days7 = per.last7.filter(counts).length || 1;
    const avg = sumHours(o, p.id, per.last7.filter(counts)) / days7;
    rows += `<tr><td style="${TD};text-align:left">${esc(who)}</td><td style="${TD};text-align:left">${esc(phoneLabel(p))}</td>` +
      `<td style="${TD}">${fmt(sumHours(o, p.id, per.last7))} h</td><td style="${TD};color:${avg < cfg.minHours ? '#c62828' : '#2e7d32'};font-weight:600">${fmt(avg)} h</td>` +
      `<td style="${TD};color:${under7 ? '#c62828' : '#2e7d32'}">${under7}</td><td style="${TD}">${fmt(sumHours(o, p.id, per.month))} h</td><td style="${TD}">${fmt(sumHours(o, p.id, per.year))} h</td>` +
      `<td style="${TD};font-weight:600">${postsFor(ps, p.userId, p.id, per.last7)}</td><td style="${TD}">${postsFor(ps, p.userId, p.id, per.month)}</td><td style="${TD}">${postsFor(ps, p.userId, p.id, per.year)}</td></tr>`;
    lines.push(`${who} — ${phoneLabel(p)}: 7 days ${fmt(sumHours(o, p.id, per.last7))} h, avg ${fmt(avg)} h/day, ${under7} day(s) under ${cfg.minHours} h, ${postsFor(ps, p.userId, p.id, per.last7)} post(s)`);
  }
  const table = `<table cellspacing="0" style="border-collapse:collapse"><tr><th style="${TH}">Person</th><th style="${TH}">Phone</th><th style="${TH}">Last 7 days</th>` +
    `<th style="${TH}">Avg / day</th><th style="${TH}">Days under ${cfg.minHours} h</th><th style="${TH}">This month</th><th style="${TH}">This year</th>` +
    `<th style="${TH}">Posts 7 days</th><th style="${TH}">Posts month</th><th style="${TH}">Posts year</th></tr>${rows}</table>`;
  const title = 'All phones — online report';
  return {
    subject: `${title} (${label(per.last7[0])} – ${label(per.t)})`,
    html: wrap(title, `<p style="font-size:13px">${phones.length} phone(s), ${new Set(phones.map((p) => p.userId)).size} people.</p>${table}`, cfg),
    text: `${title}\n${lines.join('\n')}`,
  };
}

async function mailSettings(): Promise<WhSettings> {
  return ((await db().collection('wh_settings').doc('global').get()).data() || {}) as WhSettings;
}

async function sendReports(kind: 'user' | 'allUsers' | 'overall', uid = '') {
  const cfg = await presenceSettings();
  const per = periods();
  const [people, phones, online, settings, posts] = await Promise.all([loadPeople(), loadPhones(), loadOnline(per.year[0]), mailSettings(), loadPosts(per.year[0])]);
  const msgs = [];
  if (kind === 'overall') msgs.push(overallReport(people, phones, online, per, cfg, posts));
  else {
    // Everyone with a phone or a posting this year.
    const uids = kind === 'user' ? [uid] : Array.from(new Set([...phones.map((p) => p.userId), ...Array.from(posts.keys()).map((k) => k.split('|')[0])])).filter(Boolean);
    for (const u of uids) {
      const person = people.get(u) || {uid: u, name: 'Unknown user', email: '', location: ''};
      msgs.push(userReport(person, phones, online, per, cfg, posts));
    }
  }
  for (const m of msgs) await sendMail(settings, {to: [cfg.reportTo], ...m});
  return {sent: msgs.length, to: cfg.reportTo};
}

// ---- alerts ----
async function lowHourAlerts() {
  const cfg = await presenceSettings();
  const day = addDays(today(), -1);
  if (!cfg.days.includes(weekday(day))) return 0;
  const dayStart = Date.parse(`${day}T00:00:00-05:00`);
  const [people, phones, online] = await Promise.all([loadPeople(), loadPhones(), loadOnline(day)]);
  let n = 0;
  for (const p of phones) {
    const dev = await db().collection('devices').doc(p.id).get();
    if (Number(dev.get('pairedAt') || 0) > dayStart) continue; // set up during that day
    const h = hours(online, p.id, day);
    if (h >= cfg.minHours) continue;
    n++;
    const who = people.get(p.userId)?.name || 'Unknown';
    const text = `${phoneLabel(p)} was online only ${fmt(h)} h on ${label(day)} — every phone should be on at least ${cfg.minHours} h a day.`;
    await db().collection('mp_alerts').add({kind: 'device_low_hours', deviceId: p.id, userId: p.userId, text: `${who}: ${text}`, createdAt: Date.now(), day});
    // The phone's user is told on their phone.
    const tokens = (await db().collection('devices').where('userId', '==', p.userId).get()).docs
      .filter((d) => d.get('status') !== 'revoked' && d.get('fcmToken')).map((d) => String(d.get('fcmToken')));
    if (tokens.length) {
      await admin.messaging().sendEachForMulticast({
        tokens, notification: {title: 'Keep your TIGON phone on', body: text.slice(0, 180)}, data: {kind: 'presence', deviceId: p.id},
      }).catch((e) => logger.warn('presence push failed', e));
    }
  }
  return n;
}

export const mpPresenceDaily = onSchedule({schedule: '5 7 * * *', timeZone: TZ, timeoutSeconds: 300}, async () => {
  const n = await lowHourAlerts();
  logger.info('presence: low-hour alerts', {count: n});
});

export const mpPresenceWeekly = onSchedule({schedule: '0 17 * * 5', timeZone: TZ, timeoutSeconds: 540, memory: '512MiB'}, async () => {
  try {
    const r = await sendReports('allUsers');
    logger.info('presence: weekly reports sent', r);
  } catch (e) {
    logger.error('presence: weekly reports failed', e);
  }
});

export const mpPresenceReport = onCall({timeoutSeconds: 300, memory: '512MiB'}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const role = String((await db().collection('mp_users').doc(req.auth.uid).get()).get('role') || '');
  if (role !== 'admin' && role !== 'manager') throw new HttpsError('permission-denied', 'Only managers and admins can do this.');
  const d = (req.data || {}) as Record<string, unknown>;
  const action = String(d.action || '');
  if (action === 'settings') {
    const minHours = Math.min(24, Math.max(0.5, Number(d.minHours) || 8));
    const days = Array.isArray(d.days) ? Array.from(new Set(d.days.map(Number).filter((x) => x >= 0 && x <= 6))) : [0, 1, 2, 3, 4, 5, 6];
    const reportTo = typeof d.reportTo === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.reportTo) ? d.reportTo : DEFAULT_TO;
    await db().doc(SETTINGS_DOC).set({minHours, days, reportTo, updatedAt: Date.now(), updatedBy: req.auth.uid}, {merge: true});
    return {minHours, days, reportTo};
  }
  if (action !== 'user' && action !== 'allUsers' && action !== 'overall') throw new HttpsError('invalid-argument', 'Unknown report.');
  const uid = String(d.uid || '');
  if (action === 'user' && !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument', 'Pick a user.');
  try {
    return await sendReports(action, uid);
  } catch (e) {
    throw new HttpsError('failed-precondition', e instanceof Error ? e.message : String(e));
  }
});

/** Tests only. */
export const _test = {periods, loadPosts, userReport, overallReport, hourStrip, addDays, SLOTS_PER_DAY};
