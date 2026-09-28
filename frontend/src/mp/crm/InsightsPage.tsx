import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, MenuItem, Paper, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { collection, getDocs, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import { cartTitle } from '../cartLogic';
import { formatPrice } from '../cartUtils';
import CartPicker, { type CartChoice } from './CartPicker';
import { CHANNEL_LABEL, isManager, startOfDay, useLeads, useMpSettings, useNow } from './crmData';
import type { Click, Lead } from '../growthTypes';
import type { DeviceDoc, MpCart, MpEvent } from '../types';

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MIN_POINTS = 30;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type TabKey = 'time' | 'price' | 'relist' | 'digest';

/** Monday-based day index 0-6 and hour 0-23, local time. */
const slotOf = (ts: number) => {
  const d = new Date(ts);
  return { day: (d.getDay() + 6) % 7, hour: d.getHours() };
};
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
const pctl = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const round50 = (n: number) => Math.round(n / 50) * 50;
function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Data (scoped by rules: members see their own clicks/events/leads)
// ---------------------------------------------------------------------------

function useInsightsData(person: string) {
  const { profile } = useMp();
  const manager = isManager(profile);
  const uid = profile?.uid || '';
  const who = manager ? person : uid;
  const { leads: allLeads, error: leadsError } = useLeads(profile);
  const [clicks, setClicks] = useState<Click[]>([]);
  const [posts, setPosts] = useState<MpEvent[]>([]);
  const [devices, setDevices] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const [since] = useState(() => Date.now() - WINDOW_DAYS * DAY);

  useEffect(() => {
    if (!uid) return;
    const clicksQ: Query = who === 'all'
      ? query(collection(db, COLLECTIONS.clicks), where('ts', '>=', since))
      : query(collection(db, COLLECTIONS.clicks), where('userId', '==', who));
    const postsQ: Query = who === 'all'
      ? query(collection(db, COLLECTIONS.events), where('type', '==', 'post_marked'))
      : query(collection(db, COLLECTIONS.events), where('userId', '==', who), where('type', '==', 'post_marked'));
    const fail = (e: Error) => setError(e.message);
    const u1 = onSnapshot(clicksQ, (s) => setClicks(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Click).filter((c) => c.ts >= since)), fail);
    const u2 = onSnapshot(postsQ, (s) => setPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MpEvent).filter((e) => e.ts >= since)), fail);
    return () => { u1(); u2(); };
  }, [uid, who, since]);

  useEffect(() => {
    if (!uid) return;
    const q = manager ? collection(db, 'devices') : query(collection(db, 'devices'), where('userId', '==', uid));
    getDocs(q)
      .then((s) => setDevices(new Map(s.docs.map((d) => [d.id, (d.data() as DeviceDoc).deviceName || d.id]))))
      .catch(() => undefined);
  }, [uid, manager]);

  const leads = useMemo(() => (who === 'all' ? allLeads : allLeads.filter((l) => l.ownerUid === who)), [allLeads, who]);
  return { clicks, posts, leads, allLeads, devices, error: error || leadsError, since };
}

type InsightsData = ReturnType<typeof useInsightsData>;

// ---------------------------------------------------------------------------
// Best time to post
// ---------------------------------------------------------------------------

type Metric = 'engagement' | 'clicks' | 'leads' | 'posts';

function BestTime({ data }: { data: InsightsData }) {
  const [metric, setMetric] = useState<Metric>('engagement');
  const [platform, setPlatform] = useState('all');

  // Engagement points: link clicks (by share platform) + new leads (by channel).
  const points = useMemo(() => {
    const list: Array<{ ts: number; platform: string; kind: Metric }> = [];
    for (const c of data.clicks) list.push({ ts: c.ts, platform: c.platform || 'other', kind: 'clicks' });
    for (const l of data.leads) if (l.createdAt >= data.since) list.push({ ts: l.createdAt, platform: l.channel || 'other', kind: 'leads' });
    for (const p of data.posts) list.push({ ts: p.ts, platform: 'facebook', kind: 'posts' });
    return list;
  }, [data]);

  const platforms = useMemo(() => [...new Set(points.filter((p) => p.kind !== 'posts').map((p) => p.platform))].sort(), [points]);
  const shown = points.filter((p) =>
    (metric === 'engagement' ? p.kind !== 'posts' : p.kind === metric) && (platform === 'all' || p.platform === platform));

  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const p of shown) {
    const s = slotOf(p.ts);
    grid[s.day][s.hour]++;
  }
  const max = Math.max(1, ...grid.flat());

  // Best 3 slots per platform (engagement only, ≥ MIN_POINTS each).
  const best = platforms.map((pl) => {
    const g = new Map<string, number>();
    const own = points.filter((p) => p.kind !== 'posts' && p.platform === pl);
    for (const p of own) {
      const s = slotOf(p.ts);
      const k = `${s.day}_${s.hour}`;
      g.set(k, (g.get(k) || 0) + 1);
    }
    const top = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => {
      const [d, h] = k.split('_').map(Number);
      return `${DAYS[d]} ${hourLabel(h)} (${n})`;
    });
    return { platform: pl, n: own.length, top };
  });
  const ready = best.filter((b) => b.n >= MIN_POINTS);
  const label = (pl: string) => (CHANNEL_LABEL as Record<string, string>)[pl] || pl.charAt(0).toUpperCase() + pl.slice(1);

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        When buyers respond to your posts: link clicks and new leads from the last {WINDOW_DAYS} days, by day and hour (your local time).
      </Typography>
      <ChipFilter<Metric> label="Show" value={metric} onChange={setMetric} options={[
        { value: 'engagement', label: 'Clicks + leads' }, { value: 'clicks', label: 'Link clicks' },
        { value: 'leads', label: 'New leads' }, { value: 'posts', label: 'When we posted' },
      ]} />
      {metric !== 'posts' && platforms.length > 0 && (
        <ChipFilter label="Platform" value={platform} onChange={setPlatform}
          options={[{ value: 'all', label: 'All' }, ...platforms.map((p) => ({ value: p, label: label(p) }))]} />
      )}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{shown.length} data point{shown.length === 1 ? '' : 's'}</Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '44px repeat(7, minmax(32px, 1fr))', gap: '2px', minWidth: 300 }}>
            <Box />
            {DAYS.map((d) => <Typography key={d} variant="caption" sx={{ textAlign: 'center', fontWeight: 700 }}>{d}</Typography>)}
            {Array.from({ length: 24 }, (_, h) => (
              <Box key={h} sx={{ display: 'contents' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', pr: 0.5, lineHeight: '16px' }}>{h % 3 === 0 ? hourLabel(h) : ''}</Typography>
                {DAYS.map((d, di) => {
                  const v = grid[di][h];
                  return (
                    <Tooltip key={d} title={`${d} ${hourLabel(h)}: ${v}`} disableInteractive>
                      <Box sx={{
                        height: 16, borderRadius: '2px',
                        bgcolor: v ? `rgba(175, 31, 49, ${0.15 + 0.85 * (v / max)})` : 'action.hover',
                      }} />
                    </Tooltip>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="caption" color="text.secondary">Fewer</Typography>
          <Box sx={{ width: 120, height: 8, borderRadius: 1, background: 'linear-gradient(90deg, rgba(175,31,49,0.15), rgba(175,31,49,1))' }} />
          <Typography variant="caption" color="text.secondary">More (max {max})</Typography>
        </Box>
      </Paper>

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Best 3 slots</Typography>
      {ready.length ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          {ready.map((b) => (
            <Paper key={b.platform} variant="outlined" sx={{ p: 1.5 }}>
              <Typography sx={{ fontWeight: 600 }}>{label(b.platform)} <Typography component="span" variant="caption" color="text.secondary">({b.n} data points)</Typography></Typography>
              {b.top.map((t, i) => <Typography key={t} variant="body2">{i + 1}. {t}</Typography>)}
            </Paper>
          ))}
        </Box>
      ) : (
        <Alert severity="info">
          Not enough data yet — we need at least {MIN_POINTS} clicks/leads on a platform ({Math.max(0, ...best.map((b) => b.n))} so far).
          Share tracked links and log leads, and this fills in. Until then, a common starting point is weekday evenings (6–8 pm) and
          weekend mornings (9–11 am) — general guidance, not from your data.
        </Alert>
      )}
      {ready.length > 0 && ready.length < best.length && (
        <Typography variant="caption" color="text.secondary">
          Not enough data yet for: {best.filter((b) => b.n < MIN_POINTS).map((b) => label(b.platform)).join(', ')}.
        </Typography>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Price insights
// ---------------------------------------------------------------------------

function PriceInsights({ data }: { data: InsightsData }) {
  const navigate = useNavigate();
  const { carts, profile } = useMp();
  const now = useNow();
  const [choice, setChoice] = useState<CartChoice | null>(null);
  const [picked, setPicked] = useState<MpCart | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');

  const norm = (s: string) => s.trim().toLowerCase();
  const m = norm(picked?.make || make);
  const mo = norm(picked?.model || model);
  const y = parseInt(picked?.year || year, 10);

  const comps = useMemo(() => {
    if (!m || !mo) return [];
    return carts.filter((c) => c.docId !== picked?.docId && c.price > 0 && norm(c.make) === m && norm(c.model) === mo &&
      (!y || !parseInt(c.year, 10) || Math.abs(parseInt(c.year, 10) - y) <= 2));
  }, [carts, m, mo, y, picked?.docId]);

  // Sold history: leads marked sold whose cart title names the same make + model (members: own leads only).
  const sold = useMemo(() => {
    if (!m || !mo) return [];
    return data.allLeads.filter((l: Lead) => l.status === 'sold' && (l.soldPrice || 0) > 0 &&
      norm(l.cartTitle || '').includes(m) && norm(l.cartTitle || '').includes(mo));
  }, [data.allLeads, m, mo]);

  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const soldPrices = sold.map((l) => l.soldPrice || 0).sort((a, b) => a - b);
  // "In stock at least since": the earlier of the last DMS save and the first recorded posting.
  const ages = comps.map((c) => {
    const firstPost = Math.min(...Object.values(c.postedAccounts || {}).map((e) => e.ts), ...Object.values(c.postedBy || {}), Infinity);
    const since = Math.min(c.savedAt || Infinity, firstPost);
    return Number.isFinite(since) ? Math.max(0, Math.round((now - since) / DAY)) : null;
  }).filter((a): a is number => a !== null).sort((a, b) => a - b);

  let suggestion: { low: number; high: number; why: string } | null = null;
  if (prices.length >= 3 && soldPrices.length >= 2) {
    suggestion = {
      low: round50((pctl(prices, 0.25) + pctl(soldPrices, 0.25)) / 2),
      high: round50((pctl(prices, 0.75) + pctl(soldPrices, 0.75)) / 2),
      why: `Average of the middle half of ${prices.length} comparable asking prices and ${soldPrices.length} recorded sale prices.`,
    };
  } else if (prices.length >= 3) {
    suggestion = {
      low: round50(pctl(prices, 0.25)), high: round50(pctl(prices, 0.75)),
      why: `Middle half of ${prices.length} comparable in-stock asking prices (no sold history recorded yet).`,
    };
  } else if (soldPrices.length >= 2) {
    suggestion = {
      low: round50(pctl(soldPrices, 0.25)), high: round50(pctl(soldPrices, 0.75)),
      why: `Middle half of ${soldPrices.length} recorded sale prices (fewer than 3 comparable carts in stock).`,
    };
  }

  const stat = (label: string, value: string) => (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6">{value}</Typography>
    </Paper>
  );

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Compare a cart with the same make and model (±2 years) in our inventory and with sales recorded in Leads.
      </Typography>
      <Box sx={{ mb: 1.5 }}>
        <CartPicker label="Cart" value={choice} onChange={(c, full) => { setChoice(c); setPicked(full); }} />
      </Box>
      {!choice && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '2fr 2fr 1fr' }, gap: 1, mb: 2 }}>
          <TextField size="small" label="…or make" value={make} onChange={(e) => setMake(e.target.value)} />
          <TextField size="small" label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
          <TextField size="small" label="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        </Box>
      )}
      {picked && <Typography sx={{ mb: 2 }}>{cartTitle(picked)} · {picked.year} · asking <b>{formatPrice(picked.price)}</b></Typography>}
      {m && mo && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
            {stat('Comparable in stock', String(prices.length))}
            {stat('Asking min / median / max', prices.length ? `${formatPrice(prices[0])} / ${formatPrice(Math.round(pctl(prices, 0.5)))} / ${formatPrice(prices[prices.length - 1])}` : '—')}
            {stat('Days in stock (median)', ages.length ? `${Math.round(pctl(ages, 0.5))} d` : '—')}
            {stat('Recorded sales', soldPrices.length ? `${soldPrices.length} · median ${formatPrice(Math.round(pctl(soldPrices, 0.5)))}` : '0')}
          </Box>
          {suggestion ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Suggested price range: <b>{formatPrice(suggestion.low)} – {formatPrice(suggestion.high)}</b>. {suggestion.why}
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>Not enough data for a suggestion (needs 3+ comparable carts or 2+ recorded sales).</Alert>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Data used: in-stock inventory loaded in the app; sales from leads marked sold{isManager(profile) ? '' : ' (your own leads)'} whose cart title
            contains the make and model. “Days in stock” is a rough proxy — time since the cart's last DMS update or its first recorded post.
          </Typography>
          {comps.slice().sort((a, b) => a.price - b.price).slice(0, 12).map((c) => (
            <Paper key={c.docId} variant="outlined" onClick={() => navigate(`/mp/cart/${c.docId}`)}
              sx={{ p: 1, mb: 0.5, display: 'flex', gap: 1, cursor: 'pointer', '&:hover': { boxShadow: 1 } }}>
              <Typography sx={{ flexGrow: 1 }} noWrap>{c.year} {cartTitle(c)}</Typography>
              <Typography sx={{ fontWeight: 600 }}>{formatPrice(c.price)}</Typography>
            </Paper>
          ))}
        </>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Relist
// ---------------------------------------------------------------------------

function RelistList({ person }: { person: string }) {
  const navigate = useNavigate();
  const { profile, carts, accounts, userName } = useMp();
  const settings = useMpSettings(!!profile);
  const now = useNow();
  const manager = isManager(profile);
  const who = manager ? person : profile?.uid;
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const cutoff = now - settings.relistAfterDays * DAY;

  const rows = carts.flatMap((c) =>
    Object.entries(c.postedAccounts || {})
      .filter(([, e]) => e.ts <= cutoff && (who === 'all' || e.by === who))
      .map(([id, e]) => ({ cart: c, accountId: id, entry: e })),
  ).sort((a, b) => a.entry.ts - b.entry.ts);

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Listings posted {settings.relistAfterDays}+ days ago on an account and still in stock. Refresh them to get back to the top of Marketplace.
      </Typography>
      {!rows.length && <Typography color="text.secondary" sx={{ py: 3 }}>Nothing to relist right now.</Typography>}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map(({ cart, accountId, entry }) => (
          <Paper key={`${cart.docId}_${accountId}`} variant="outlined" sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ flexGrow: 1, minWidth: 200 }}>
              <Typography sx={{ fontWeight: 600 }}>{cartTitle(cart)} · {formatPrice(cart.price)}</Typography>
              <Typography variant="body2" color="text.secondary">
                on {acct.get(accountId) || 'an account'} · {Math.floor((now - entry.ts) / DAY)} days ago{who === 'all' ? ` · by ${userName(entry.by)}` : ''}
              </Typography>
            </Box>
            <Button variant="contained" size="small" onClick={() => navigate(`/mp/cart/${cart.docId}`)}>Queue again</Button>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Weekly digest preview
// ---------------------------------------------------------------------------

function Digest({ data }: { data: InsightsData }) {
  const { carts, userName, profile } = useMp();
  const now = useNow();
  const thisStart = startOfWeek(now);
  const lastStart = thisStart - 7 * DAY;
  const manager = isManager(profile);

  const week = (from: number, to: number) => {
    const inR = (ts?: number) => !!ts && ts >= from && ts < to;
    const posts = data.posts.filter((p) => inR(p.ts));
    const leads = data.leads.filter((l) => inR(l.createdAt));
    const sales = data.leads.filter((l) => l.status === 'sold' && inR(l.soldAt));
    const clicks = data.clicks.filter((c) => inR(c.ts));
    const cartScore = new Map<string, number>();
    const titles = new Map<string, string>();
    for (const l of leads) if (l.cartId) { cartScore.set(l.cartId, (cartScore.get(l.cartId) || 0) + 1); if (l.cartTitle) titles.set(l.cartId, l.cartTitle); }
    for (const c of clicks) if (c.cartId) cartScore.set(c.cartId, (cartScore.get(c.cartId) || 0) + 1);
    const phone = new Map<string, number>();
    for (const p of posts) if (p.deviceId && p.deviceId !== 'web') phone.set(p.deviceId, (phone.get(p.deviceId) || 0) + 1);
    const people = new Map<string, number>();
    const add = (u: string | undefined, n: number) => { if (u) people.set(u, (people.get(u) || 0) + n); };
    posts.forEach((p) => add(p.userId, 1));
    leads.forEach((l) => add(l.ownerUid, 3));
    sales.forEach((l) => add(l.ownerUid, 10));
    const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const tc = top(cartScore);
    const tp = top(phone);
    const pp = top(people);
    const cart = tc ? carts.find((c) => c.docId === tc[0]) : undefined;
    return {
      posts: posts.length, leads: leads.length, sales: sales.length, clicks: clicks.length,
      topCart: tc ? `${cart ? cartTitle(cart) : titles.get(tc[0]) || 'A cart'} (${tc[1]})` : '—',
      bestPhone: tp ? `${data.devices.get(tp[0]) || tp[0]} (${tp[1]} posts)` : '—',
      bestPerson: pp ? userName(pp[0]) : '—',
    };
  };
  const cur = week(thisStart, now + 1);
  const prev = week(lastStart, thisStart);

  const tile = (label: string, a: number, b: number) => {
    const diff = a - b;
    return (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{a}</Typography>
        <Typography variant="caption" color="text.secondary">
          {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)} vs last week ({b})
        </Typography>
      </Paper>
    );
  };
  const line = (label: string, a: string, b: string) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr 1fr' }, gap: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2">This week: {a}</Typography>
      <Typography variant="body2" color="text.secondary">Last week: {b}</Typography>
    </Box>
  );

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Preview of the Monday digest{manager ? ' (team, or the person selected above)' : ' (your own activity)'}. The full digest is sent every Monday at 8 am to your phone.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
        {tile('Posts', cur.posts, prev.posts)}
        {tile('Leads', cur.leads, prev.leads)}
        {tile('Sales', cur.sales, prev.sales)}
        {tile('Link clicks', cur.clicks, prev.clicks)}
      </Box>
      {line('Top cart', cur.topCart, prev.topCart)}
      {line('Best phone', cur.bestPhone, prev.bestPhone)}
      {manager && line('Best person', cur.bestPerson, prev.bestPerson)}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Insights: best time to post, price insights, relist list, weekly digest preview. */
export default function InsightsPage() {
  const { profile, users } = useMp();
  const manager = isManager(profile);
  const [tab, setTab] = useState<TabKey>('time');
  const [person, setPerson] = useState('all');
  const data = useInsightsData(person);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Insights</Typography>
        {manager && (
          <TextField select size="small" label="Person" value={person} onChange={(e) => setPerson(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="all">Everyone</MenuItem>
            {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab value="time" label="Best time" />
        <Tab value="price" label="Price" />
        <Tab value="relist" label="Relist" />
        <Tab value="digest" label="Weekly digest" />
      </Tabs>
      {data.error && <Alert severity="warning" sx={{ mb: 2 }}>Some data could not be loaded: {data.error}</Alert>}
      {tab === 'time' && <BestTime data={data} />}
      {tab === 'price' && <PriceInsights data={data} />}
      {tab === 'relist' && <RelistList person={person} />}
      {tab === 'digest' && <Digest data={data} />}
    </MpShell>
  );
}
