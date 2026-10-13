// Insights — /mp/live: manager live board for a TV. Dark, big numbers, updates by itself (live Firestore),
// fullscreen button. New leads waiting (live timers), who's online, texting phones per store, today's
// appointments, sales and quotes opened today. Admins: "Email weekly report now".
import React, { useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Email, Fullscreen, FullscreenExit, LiveTv } from '@mui/icons-material';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { isManager } from '../crm/crmData';
import { CHANNEL_LABEL } from '../crm/crmData';
import { SALES_COLLECTIONS } from '../sales/salesTypes';
import { useSalesSettings } from '../sales/salesData';
import { STORE_IDS, nyDateKey, nyTime, storeName } from '../sales/closing/closingUtils';
import type { LeadChannel } from '../growthTypes';
import { notify } from '../../ui/notify';
import { useLive, useTick, type Row } from './useLive';
import { customerPath } from './phone';
import { sendWeeklyNow } from './insightsApi';
import AiPostPicks from './AiPostPicks';

const MIN = 60_000;
const ONLINE_MS = 10 * MIN;
const dark = createTheme({ palette: { mode: 'dark', background: { default: '#0b1016', paper: '#141b24' }, primary: { main: '#64b5f6' } } });

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const clock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const ago = (ms: number) => (ms < MIN ? 'just now' : ms < 60 * MIN ? `${Math.round(ms / MIN)} min ago` : ms < 48 * 60 * MIN ? `${Math.round(ms / (60 * MIN))} h ago` : `${Math.round(ms / (1440 * MIN))} days ago`);
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const Tile: React.FC<{ label: string; value: string | number; tone?: 'bad' | 'good' }> = ({ label, value, tone }) => (
  <Paper sx={{ p: { xs: 1.5, md: 2.5 }, textAlign: 'center', flex: '1 1 150px' }}>
    <Typography sx={{ fontSize: { xs: 36, md: 64 }, fontWeight: 800, lineHeight: 1.1, color: tone === 'bad' ? '#ff6b6b' : tone === 'good' ? '#69f0ae' : 'text.primary' }}>
      {value}
    </Typography>
    <Typography sx={{ fontSize: { xs: 14, md: 20 }, color: 'text.secondary' }}>{label}</Typography>
  </Paper>
);

const Panel: React.FC<{ title: string; children: React.ReactNode; count?: number }> = ({ title, children, count }) => (
  <Paper sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
    <Typography sx={{ fontSize: { xs: 18, md: 24 }, fontWeight: 700, mb: 1 }}>{title}{count !== undefined ? ` (${count})` : ''}</Typography>
    {children}
  </Paper>
);

const Line: React.FC<{ left: React.ReactNode; right?: React.ReactNode; sub?: string; tone?: 'bad' | 'warn' }> = ({ left, right, sub, tone }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.75, borderTop: 1, borderColor: 'divider' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: { xs: 16, md: 20 }, fontWeight: 600 }} noWrap>{left}</Typography>
      {sub && <Typography sx={{ fontSize: { xs: 13, md: 15 }, color: 'text.secondary' }} noWrap>{sub}</Typography>}
    </Box>
    {right !== undefined && (
      <Typography sx={{ fontSize: { xs: 18, md: 26 }, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: tone === 'bad' ? '#ff6b6b' : tone === 'warn' ? '#ffd54f' : 'text.primary' }}>
        {right}
      </Typography>
    )}
  </Box>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <Typography sx={{ color: 'text.secondary', fontSize: { xs: 15, md: 18 } }}>{text}</Typography>;

const Board: React.FC<{ store: string }> = ({ store }) => {
  const { userName, isAdmin } = useMp();
  const { settings } = useSalesSettings();
  const now = useTick(1000);
  const day = nyDateKey(now);
  const start = nyTime(day, '00:00');
  const end = nyTime(nyDateKey(start + 36 * 3600_000), '00:00');
  const leads = collection(db, 'mp_leads');
  const created = useLive(`lc_${day}`, query(leads, where('createdAt', '>=', start)));
  const sold = useLive(`ls_${day}`, query(leads, where('soldAt', '>=', start)));
  const devices = useLive('dev', query(collection(db, 'devices'), where('source', '==', 'tigon-iot-app')));
  const queued = useLive('queued', query(collection(db, SALES_COLLECTIONS.sms), where('status', '==', 'queued')));
  const appts = useLive(`ap_${day}`, query(collection(db, SALES_COLLECTIONS.appointments), where('startAt', '>=', start)));
  const opened = useLive(`qo_${day}`, query(collection(db, SALES_COLLECTIONS.quotes), where('openedAt', '>=', start)));
  const [sending, setSending] = useState(false);

  const inStore = (r: Row, field = 'locationId') => !store || s(r[field]) === store;
  const waiting = created.rows.filter((l) => inStore(l) && (s(l.status) || 'new') === 'new' && !n(l.firstResponseAt))
    .sort((a, b) => n(a.createdAt) - n(b.createdAt));
  const sales = sold.rows.filter((l) => l.status === 'sold' && inStore(l));
  const revenue = sales.reduce((t, l) => t + n(l.soldPrice), 0);
  const todayAppts = appts.rows.filter((a) => n(a.startAt) < end && inStore(a, 'storeId') && a.status !== 'cancelled').sort((a, b) => n(a.startAt) - n(b.startAt));
  const quotesOpened = opened.rows.filter((q) => inStore(q, 'storeId')).sort((a, b) => n(b.openedAt) - n(a.openedAt));
  const phones = devices.rows.filter((d) => d.status !== 'revoked');

  const online = useMemo(() => {
    const byUser = new Map<string, { name: string; phones: string[]; lastSeen: number }>();
    for (const d of phones) {
      if (now - n(d.lastSeen) > ONLINE_MS) continue;
      if (store && s(d.locationId) && s(d.locationId) !== store) continue;
      const uid = s(d.userId) || d.id;
      const cur = byUser.get(uid) || { name: s(d.userId) ? userName(s(d.userId)) : s(d.deviceName), phones: [], lastSeen: 0 };
      cur.phones.push(s(d.deviceName) || 'Phone');
      cur.lastSeen = Math.max(cur.lastSeen, n(d.lastSeen));
      byUser.set(uid, cur);
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [phones, now, store, userName]);

  const texting = useMemo(() => {
    const byStore = settings.sms.senderDeviceByStore || {};
    const stores = (store ? [store] : STORE_IDS).filter((id) => byStore[id] || settings.sms.defaultSenderDeviceId);
    const devById = new Map(phones.map((d) => [d.id, d]));
    const rows = stores.map((id) => ({ id, devId: byStore[id] || settings.sms.defaultSenderDeviceId, shared: !byStore[id] }));
    // Texts with no store (or a store with no phone of its own) go out from the default phone.
    if (!store && settings.sms.defaultSenderDeviceId) rows.push({ id: '', devId: settings.sms.defaultSenderDeviceId, shared: true });
    const known = new Set(stores);
    return rows.map(({ id, devId, shared }) => {
      const dev = devById.get(devId);
      const q = queued.rows.filter((m) => (id ? s(m.storeId) === id : !known.has(s(m.storeId))));
      const due = q.map((m) => n(m.sendAt) || n(m.createdAt)).filter((t) => t && t <= now);
      const ping = n(dev?.lastPingAt) || n(dev?.lastSeen);
      return { id, name: s(dev?.deviceName) || (devId ? 'Phone' : 'Not set'), ping, queued: q.length, oldest: due.length ? now - Math.min(...due) : 0, shared };
    }).filter((r) => r.id || r.queued);
  }, [settings.sms, store, phones, queued.rows, now]);

  const emailNow = async () => {
    setSending(true);
    try {
      const r = await sendWeeklyNow();
      notify(`Weekly report sent to ${r.to}.`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const err = created.error || devices.error || queued.error || appts.error || opened.error || sold.error;
  return (
    <Stack spacing={2}>
      {err && <Alert severity="error">{err}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Tile label="New leads waiting" value={waiting.length} tone={waiting.length ? 'bad' : 'good'} />
        <Tile label="Sold today" value={sales.length} tone={sales.length ? 'good' : undefined} />
        <Tile label="Revenue today" value={money(revenue)} />
        <Tile label="Appointments today" value={todayAppts.length} />
        <Tile label="Quotes opened today" value={quotesOpened.length} />
        <Tile label="People online" value={online.length} />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' } }}>
        <Panel title="Waiting for a first reply" count={waiting.length}>
          {!waiting.length && <Empty text="Every new lead today has an answer." />}
          {waiting.slice(0, 12).map((l) => {
            const wait = now - n(l.createdAt);
            const path = customerPath(l.phone);
            return (
              <Line
                key={l.id}
                left={path ? <RouterLink to={path} style={{ color: 'inherit', textDecoration: 'none' }}>{s(l.name) || 'New lead'}</RouterLink> : s(l.name) || 'New lead'}
                sub={[CHANNEL_LABEL[s(l.channel) as LeadChannel] || s(l.channel), storeName(s(l.locationId)), s(l.ownerUid) ? userName(s(l.ownerUid)) : 'No owner yet'].filter(Boolean).join(' · ')}
                right={clock(wait)} tone={wait > 15 * MIN ? 'bad' : wait > 5 * MIN ? 'warn' : undefined}
              />
            );
          })}
        </Panel>
        <Panel title="Who's online" count={online.length}>
          {!online.length && <Empty text="No phones online right now." />}
          {online.map((p) => <Line key={p.name + p.phones.join()} left={p.name} sub={p.phones.join(', ')} right={<Chip size="small" color="success" label="online" />} />)}
        </Panel>
        <Panel title="Texting phones">
          {!texting.length && <Empty text="No texting phone is set up (Sales settings → Texting)." />}
          {texting.map((t) => {
            const late = !t.ping || now - t.ping > 15 * MIN;
            return (
              <Line
                key={t.id || 'default'} left={t.id ? storeName(t.id) : 'Other texts (default phone)'} tone={late || t.oldest > 10 * MIN ? 'bad' : undefined}
                sub={`${t.name}${t.shared ? ' (shared)' : ''} · checked in ${t.ping ? ago(now - t.ping) : 'never'}${t.queued ? ` · oldest waiting ${ago(t.oldest).replace(' ago', '')}` : ''}`}
                right={late ? 'Offline' : t.queued ? `${t.queued} waiting` : 'OK'}
              />
            );
          })}
        </Panel>
        <Panel title="Today's appointments" count={todayAppts.length}>
          {!todayAppts.length && <Empty text="No appointments today." />}
          {todayAppts.map((a) => (
            <Line
              key={a.id} left={s(a.name) || 'Customer'} right={hhmm(n(a.startAt))}
              sub={[s(a.kind).replace(/_/g, ' '), storeName(s(a.storeId)), s(a.status) === 'showed' ? 'showed up' : s(a.status) === 'no_show' ? 'no-show' : s(a.cartTitle)].filter(Boolean).join(' · ')}
              tone={s(a.status) === 'no_show' ? 'bad' : undefined}
            />
          ))}
        </Panel>
        <Panel title="Sales today" count={sales.length}>
          {!sales.length && <Empty text="No sales yet today." />}
          {sales.map((l) => (
            <Line key={l.id} left={s(l.cartTitle) || s(l.name) || 'Sale'} sub={[userName(s(l.ownerUid)), storeName(s(l.locationId))].filter(Boolean).join(' · ')} right={n(l.soldPrice) ? money(n(l.soldPrice)) : ''} />
          ))}
        </Panel>
        <Panel title="Quotes opened today" count={quotesOpened.length}>
          {!quotesOpened.length && <Empty text="No quotes opened yet today." />}
          {quotesOpened.slice(0, 12).map((q) => (
            <Line key={q.id} left={s(q.customerName) || 'Customer'} sub={[s(q.cartTitle), s(q.salespersonName)].filter(Boolean).join(' · ')} right={hhmm(n(q.openedAt))} />
          ))}
        </Panel>
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <AiPostPicks storeId={store || undefined} />
        {isAdmin && (
          <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography sx={{ flex: 1, minWidth: 200 }}>The weekly report goes out every Monday at 7 AM. Need it now?</Typography>
            <Button variant="outlined" startIcon={sending ? <CircularProgress size={16} /> : <Email />} onClick={emailNow} disabled={sending}>
              Email weekly report now
            </Button>
          </Paper>
        )}
      </Box>
    </Stack>
  );
};

const LiveBoard: React.FC = () => {
  const { profile } = useMp();
  const [params, setParams] = useSearchParams();
  const store = params.get('store') || '';
  const boxRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const now = useTick(30_000);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFull(false);
      } else {
        await boxRef.current?.requestFullscreen();
        setFull(true);
        document.addEventListener('fullscreenchange', () => setFull(!!document.fullscreenElement), { once: true });
      }
    } catch {
      notify('Fullscreen is not available on this device.', 'info');
    }
  };

  return (
    <MpShell>
      {!isManager(profile) ? <Alert severity="warning">The live board is for managers.</Alert> : (
        <ThemeProvider theme={dark}>
          <Box ref={boxRef} sx={{ bgcolor: 'background.default', color: 'text.primary', p: { xs: 1.5, md: 3 }, borderRadius: full ? 0 : 2, overflowY: 'auto', minHeight: full ? '100vh' : undefined }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <LiveTv color="primary" sx={{ fontSize: { xs: 28, md: 40 } }} />
              <Typography sx={{ fontSize: { xs: 24, md: 40 }, fontWeight: 800, flex: 1 }}>Live board</Typography>
              <Typography sx={{ fontSize: { xs: 18, md: 32 }, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                {new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Typography>
              <TextField
                select size="small" value={store} sx={{ minWidth: 160 }} aria-label="Store"
                onChange={(e) => setParams((p) => { if (e.target.value) p.set('store', e.target.value); else p.delete('store'); return p; })}
              >
                <MenuItem value="">All stores</MenuItem>
                {STORE_IDS.map((id) => <MenuItem key={id} value={id}>{storeName(id)}</MenuItem>)}
              </TextField>
              <Button variant="outlined" startIcon={full ? <FullscreenExit /> : <Fullscreen />} onClick={toggleFull}>{full ? 'Exit' : 'Fullscreen'}</Button>
            </Box>
            <Board store={store} />
          </Box>
        </ThemeProvider>
      )}
    </MpShell>
  );
};

export default LiveBoard;
