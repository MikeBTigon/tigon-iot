// Insights — weekly owner report: aggregation and HTML (pure, no Firebase; unit-tested).
type Json = Record<string, any>;

export interface WeeklyInput {
  from: number;
  to: number;
  now: number;
  /** Leads created in [from, to). */
  leads: Json[];
  /** Leads with soldAt in [from, to). */
  sold: Json[];
  /** Appointments created in [from, to) (set) and starting in [from, to) (shown / no-show). */
  apptsCreated: Json[];
  apptsStarting: Json[];
  /** Quotes created in [from, to) and quotes opened in [from, to). */
  quotesCreated: Json[];
  quotesOpened: Json[];
  /** All carts (mp_carts) — stockedAt / firstSeenAt / createdAt / savedAt, soldLocally. */
  carts: Json[];
  agedFlagDays: number;
  agedUrgentDays: number;
  /** mp_reviews docs. */
  reviews: Json[];
  /** Texting phones: one per store that has one set. */
  textingPhones: Array<{storeId: string; deviceId: string; name: string; lastPingAt: number}>;
  /** mp_sms docs still queued (any age). */
  queued: Json[];
  /** mp_sms docs created in [from, to). */
  smsWeek: Json[];
  people: Record<string, string>;
  stores: Record<string, string>;
}

export interface Row {key: string; name: string; leads: number; sales: number; revenue: number}

export interface WeeklyReport {
  from: number;
  to: number;
  leads: {total: number; bySource: Array<[string, number]>};
  firstResponse: {median: number | null; responded: number; waiting: number};
  appointments: {set: number; shown: number; noShow: number; upcoming: number};
  quotes: {sent: number; opened: number};
  sales: {count: number; revenue: number};
  topStores: Row[];
  topSalespeople: Row[];
  aged: {count: number; urgent: number; flagDays: number; urgentDays: number; total: number};
  reviews: Array<{store: string; rating: number; count: number; newThisWeek: number | null}>;
  texting: {
    phones: Array<{store: string; name: string; minutesSincePing: number | null; ok: boolean}>;
    queued: number;
    oldestQueuedMinutes: number | null;
    sent: number;
    failed: number;
  };
}

const MIN = 60_000;
const DAY = 86_400_000;
const SOURCE_LABEL: Record<string, string> = {
  website: 'Website', facebook: 'Facebook', facebook_message: 'Facebook message', marketplace: 'Marketplace', missed_call: 'Missed call',
  phone: 'Phone call', walk_in: 'Walk-in', walkin: 'Walk-in', quote: 'Quote', booking: 'Booking', trade_in: 'Trade-in', prequal: 'Pre-qualification',
  referral: 'Referral', credit_app: 'Credit application', sms: 'Text', other: 'Other',
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] || (s ? s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Other');

export function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n) && n >= 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Minutes from lead creation to the first human reply. */
export function responseMinutes(l: Json): number | null {
  if (Number.isFinite(Number(l.responseMinutes)) && l.responseMinutes !== null && l.responseMinutes !== undefined) return Number(l.responseMinutes);
  const f = Number(l.firstResponseAt);
  const c = Number(l.createdAt);
  return f && c && f >= c ? (f - c) / MIN : null;
}

const cartAge = (c: Json, now: number) => {
  const t = Number(c.stockedAt) || Number(c.firstSeenAt) || Number(c.createdAt) || 0;
  return t ? (now - t) / DAY : null;
};

export function buildWeekly(i: WeeklyInput): WeeklyReport {
  const leads = i.leads.filter((l) => !l.isTest);
  const bySource = new Map<string, number>();
  for (const l of leads) {
    const k = sourceLabel(String(l.source || l.channel || 'other'));
    bySource.set(k, (bySource.get(k) || 0) + 1);
  }
  const mins = leads.map(responseMinutes).filter((n): n is number => n !== null);

  const stores = new Map<string, Row>();
  const people = new Map<string, Row>();
  const row = (m: Map<string, Row>, key: string, name: string) => {
    if (!m.has(key)) m.set(key, {key, name, leads: 0, sales: 0, revenue: 0});
    return m.get(key)!;
  };
  for (const l of leads) {
    const s = String(l.locationId || '');
    if (s) row(stores, s, i.stores[s] || s).leads++;
    const o = String(l.ownerUid || '');
    if (o) row(people, o, i.people[o] || 'Unknown').leads++;
  }
  let revenue = 0;
  for (const l of i.sold) {
    const price = Number(l.soldPrice) || 0;
    revenue += price;
    const s = String(l.locationId || '');
    if (s) {
      const r = row(stores, s, i.stores[s] || s);
      r.sales++;
      r.revenue += price;
    }
    const o = String(l.ownerUid || '');
    if (o) {
      const r = row(people, o, i.people[o] || 'Unknown');
      r.sales++;
      r.revenue += price;
    }
  }
  const rank = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || b.leads - a.leads).slice(0, 5);

  const stock = i.carts.filter((c) => !c.soldLocally);
  const ages = stock.map((c) => cartAge(c, i.now)).filter((n): n is number => n !== null);

  const queuedAt = i.queued.map((q) => Number(q.sendAt) || Number(q.createdAt) || 0).filter((t) => t > 0 && t <= i.now);
  return {
    from: i.from,
    to: i.to,
    leads: {total: leads.length, bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1])},
    firstResponse: {median: mins.length ? Math.round(median(mins)! * 10) / 10 : null, responded: mins.length, waiting: leads.length - mins.length},
    appointments: {
      set: i.apptsCreated.length,
      shown: i.apptsStarting.filter((a) => a.status === 'showed').length,
      noShow: i.apptsStarting.filter((a) => a.status === 'no_show').length,
      upcoming: i.apptsStarting.filter((a) => a.status === 'booked' && Number(a.startAt) > i.now).length,
    },
    quotes: {sent: i.quotesCreated.length, opened: i.quotesOpened.length},
    sales: {count: i.sold.length, revenue},
    topStores: rank(stores),
    topSalespeople: rank(people),
    aged: {
      count: ages.filter((a) => a >= i.agedFlagDays).length, urgent: ages.filter((a) => a >= i.agedUrgentDays).length,
      flagDays: i.agedFlagDays, urgentDays: i.agedUrgentDays, total: stock.length,
    },
    reviews: i.reviews.filter((r) => Number(r.count) > 0).map((r) => ({
      store: i.stores[String(r.storeId || r.id)] || String(r.storeId || r.id || ''), rating: Number(r.rating) || 0, count: Number(r.count) || 0,
      newThisWeek: Number.isFinite(Number(r.countWeekAgo)) && r.countWeekAgo !== undefined && r.countWeekAgo !== null ? Number(r.count) - Number(r.countWeekAgo) : null,
    })).sort((a, b) => b.count - a.count),
    texting: {
      phones: i.textingPhones.map((p) => {
        const m = p.lastPingAt ? Math.round((i.now - p.lastPingAt) / MIN) : null;
        return {store: i.stores[p.storeId] || p.storeId || 'All stores', name: p.name, minutesSincePing: m, ok: m !== null && m <= 15};
      }),
      queued: i.queued.length,
      oldestQueuedMinutes: queuedAt.length ? Math.round((i.now - Math.min(...queuedAt)) / MIN) : null,
      sent: i.smsWeek.filter((s) => s.status === 'sent').length,
      failed: i.smsWeek.filter((s) => s.status === 'failed').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[c] as string));
export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const day = (ts: number) => new Date(ts).toLocaleDateString('en-US', {timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric'});
const ago = (m: number | null) => (m === null ? 'never' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`);
const TH = 'text-align:left;padding:6px 10px;background:#f1f3f6;font-size:12px;color:#555';
const TD = 'padding:6px 10px;border-top:1px solid #eee;font-size:14px';

function table(head: string[], rows: string[][]): string {
  if (!rows.length) return '<p style="color:#777;font-size:14px;margin:4px 0 0">Nothing this week.</p>';
  return `<table cellspacing="0" style="border-collapse:collapse;width:100%">` +
    `<tr>${head.map((h) => `<th style="${TH}">${esc(h)}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td style="${TD}">${c}</td>`).join('')}</tr>`).join('') + '</table>';
}

function tile(label: string, value: string, sub = ''): string {
  return `<td style="padding:10px;border:1px solid #e3e6ea;border-radius:8px;text-align:center;width:25%">` +
    `<div style="font-size:24px;font-weight:700;color:#0e4671">${esc(value)}</div><div style="font-size:12px;color:#555">${esc(label)}</div>` +
    `${sub ? `<div style="font-size:11px;color:#888">${esc(sub)}</div>` : ''}</td>`;
}

export function renderWeekly(r: WeeklyReport): {subject: string; html: string; text: string} {
  const range = `${day(r.from)} – ${day(r.to - 1)}`;
  const fr = r.firstResponse.median === null ? '—' : `${r.firstResponse.median} min`;
  const h2 = (t: string) => `<h2 style="font-size:16px;color:#0e4671;margin:22px 0 6px">${esc(t)}</h2>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px;margin:0 auto">
<div style="background:#0e4671;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;border-bottom:5px solid #af1f31">
<div style="font-size:12px;opacity:.85">TIGON Golf Carts · weekly report</div><div style="font-size:20px;font-weight:bold">${esc(range)}</div></div>
<div style="padding:12px 4px">
<table cellspacing="8" style="width:100%"><tr>${tile('New leads', String(r.leads.total))}${tile('First reply (median)', fr, `${r.firstResponse.waiting} not answered yet`)}` +
`${tile('Sales', String(r.sales.count), money(r.sales.revenue))}${tile('Appointments set', String(r.appointments.set), `${r.appointments.shown} showed`)}</tr></table>
${h2('Leads by source')}${table(['Source', 'Leads'], r.leads.bySource.map(([k, n]) => [esc(k), String(n)]))}
${h2('Appointments and quotes')}${table(['', 'This week'], [
    ['Appointments set', String(r.appointments.set)], ['Showed up', String(r.appointments.shown)], ['No-shows', String(r.appointments.noShow)],
    ['Quotes sent', String(r.quotes.sent)], ['Quotes opened by the customer', String(r.quotes.opened)],
  ])}
${h2('Top stores')}${table(['Store', 'Leads', 'Sales', 'Revenue'], r.topStores.map((s) => [esc(s.name), String(s.leads), String(s.sales), money(s.revenue)]))}
${h2('Top salespeople')}${table(['Salesperson', 'Leads', 'Sales', 'Revenue'], r.topSalespeople.map((s) => [esc(s.name), String(s.leads), String(s.sales), money(s.revenue)]))}
${h2('Inventory')}<p style="font-size:14px;margin:4px 0">${r.aged.count} of ${r.aged.total} carts have been in stock ${r.aged.flagDays}+ days` +
` (${r.aged.urgent} over ${r.aged.urgentDays} days). Consider a price cut or a fresh post for these.</p>
${h2('Google reviews')}${table(['Store', 'Rating', 'Reviews', 'New this week'], r.reviews.map((v) => [esc(v.store), v.rating ? v.rating.toFixed(1) : '—', String(v.count), v.newThisWeek === null ? '—' : String(v.newThisWeek)]))}
${h2('Texting phones')}${table(['Store', 'Phone', 'Last check-in', ''], r.texting.phones.map((p) => [esc(p.store), esc(p.name), ago(p.minutesSincePing),
    p.ok ? '<span style="color:#2e7d32">OK</span>' : '<b style="color:#c62828">Check this phone</b>']))}
<p style="font-size:14px;margin:6px 0">${r.texting.sent} texts sent, ${r.texting.failed} failed this week. ${r.texting.queued} waiting to send` +
`${r.texting.oldestQueuedMinutes !== null ? ` (oldest ${ago(r.texting.oldestQueuedMinutes).replace(' ago', '')})` : ''}.</p>
<p style="font-size:12px;color:#777;margin-top:20px"><a href="https://tigoniot.com/mp/live">Open the live board</a> · Sent every Monday morning by TIGON IOT.</p>
</div></div>`;
  const text = [
    `TIGON weekly report ${range}`,
    `New leads: ${r.leads.total} (${r.leads.bySource.map(([k, n]) => `${k} ${n}`).join(', ') || 'none'})`,
    `Median first reply: ${fr}`,
    `Appointments set ${r.appointments.set}, showed ${r.appointments.shown}, no-shows ${r.appointments.noShow}`,
    `Quotes sent ${r.quotes.sent}, opened ${r.quotes.opened}`,
    `Sales ${r.sales.count}, revenue ${money(r.sales.revenue)}`,
    `Top stores: ${r.topStores.map((s) => `${s.name} (${s.sales} sales)`).join(', ') || '—'}`,
    `Top salespeople: ${r.topSalespeople.map((s) => `${s.name} (${s.sales} sales)`).join(', ') || '—'}`,
    `Aged carts (${r.aged.flagDays}+ days): ${r.aged.count} of ${r.aged.total}`,
    `Reviews: ${r.reviews.map((v) => `${v.store} ${v.rating.toFixed(1)} (${v.count})`).join(', ') || '—'}`,
    `Texting phones: ${r.texting.phones.map((p) => `${p.store} ${p.ok ? 'OK' : 'CHECK'}`).join(', ') || 'none set'}; ${r.texting.queued} waiting`,
  ].join('\n');
  return {subject: `TIGON weekly report: ${r.leads.total} leads, ${r.sales.count} sales (${range})`, html, text};
}
