// Track 3 — customer page /book/:storeId?  (?lead=&cart=&q=): pick a store, a day and a time for a test drive or visit.
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { CheckCircle, Place } from '@mui/icons-material';
import PublicShell from '../public/PublicShell';
import { publicGet, publicPost } from '../public/publicApi';
import { dayLabel } from './closingUtils';

interface StoreInfo { id: string; name: string; city: string; address: string; phone: string }
interface Info { enabled: boolean; stores: StoreInfo[]; days: Array<{ date: string; weekday: string; closed: boolean }>; cart: { id: string; title: string; storeId: string } | null; store: StoreInfo | null }
interface Slot { start: number; label: string }

const BookPublicPage: React.FC = () => {
  const { storeId: pathStore } = useParams();
  const [params] = useSearchParams();
  const lead = params.get('lead') || '';
  const cartParam = params.get('cart') || '';
  const quote = params.get('q') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [infoError, setInfoError] = useState('');
  const [picked, setPicked] = useState('');
  const [kind, setKind] = useState<'test_drive' | 'visit'>('test_drive');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<{ key: string; slots: Slot[]; error: string }>({ key: '', slots: [], error: '' });
  const [start, setStart] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ when: string; store: StoreInfo | null; cartTitle: string; kind: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    publicGet<Info>(`booking/info?${new URLSearchParams({ store: pathStore || '', cart: cartParam }).toString()}`)
      .then(setInfo).catch((e) => setInfoError(e instanceof Error ? e.message : String(e)));
  }, [pathStore, cartParam]);

  const storeId = picked || info?.store?.id || info?.cart?.storeId || '';
  const store = info?.stores.find((s) => s.id === storeId) || null;
  const firstOpen = info?.days.find((d) => !d.closed)?.date || '';
  const day = date || firstOpen;
  const key = storeId && day ? `${storeId}|${day}|${refresh}` : '';

  useEffect(() => {
    if (!storeId || !day) return;
    const k = `${storeId}|${day}|${refresh}`;
    publicGet<{ slots: Slot[] }>(`booking/slots?${new URLSearchParams({ store: storeId, date: day }).toString()}`)
      .then((r) => setSlots({ key: k, slots: r.slots, error: '' }))
      .catch((e) => setSlots({ key: k, slots: [], error: e instanceof Error ? e.message : String(e) }));
  }, [storeId, day, refresh]);
  const slotsReady = slots.key === key;

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!start) { setError('Please pick a time.'); return; }
    setBusy(true);
    try {
      const r = await publicPost<{ when: string; store: StoreInfo | null; cartTitle: string; kind: string }>('booking/book', {
        store: storeId, date: day, start, kind, name, phone, email, notes, cart: info?.cart?.id || '', lead, q: quote,
      });
      setDone(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStart(null);
      setRefresh((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const phoneNum = store?.phone || '1-844-844-6638';

  if (done) {
    return (
      <PublicShell title="You're booked!" phone={done.store?.phone || phoneNum}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle color="success" sx={{ fontSize: 48 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, mt: 1 }}>{done.when}</Typography>
            <Typography sx={{ mt: 0.5 }}>{done.kind === 'visit' ? 'Store visit' : 'Test drive'}{done.cartTitle ? ` — ${done.cartTitle}` : ''}</Typography>
            {done.store && (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                TIGON Golf Carts {done.store.city}<br />{done.store.address}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>We'll text you a reminder. Need to change it? Call or text {done.store?.phone || phoneNum}.</Typography>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell title={kind === 'visit' ? 'Book a visit' : 'Book a test drive'} subtitle={info?.cart ? `For the ${info.cart.title}` : 'Pick a day and time that works for you.'} phone={store ? phoneNum : undefined}>
      {infoError && <Alert severity="error" sx={{ mb: 2 }}>{infoError}</Alert>}
      {!info && !infoError && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>}
      {info && !info.enabled && <Alert severity="info" sx={{ mb: 2 }}>Online booking is not available right now. Please call us at {phoneNum}.</Alert>}
      {info && info.enabled && !storeId && (
        <>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Which store?</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {info.stores.map((s) => (
              <Card key={s.id} variant="outlined">
                <CardActionArea onClick={() => setPicked(s.id)} sx={{ p: 1.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{s.city || s.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.address}</Typography>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </>
      )}
      {info && info.enabled && storeId && (
        <Card>
          <CardContent component="form" onSubmit={book}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Place color="primary" />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>TIGON Golf Carts {store?.city || store?.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{store?.address}</Typography>
                </Box>
                {!pathStore && !info.cart?.storeId && <Button size="small" onClick={() => { setPicked(''); setStart(null); }}>Change store</Button>}
              </Box>
              <ToggleButtonGroup exclusive fullWidth value={kind} onChange={(_e, v) => v && setKind(v)}>
                <ToggleButton value="test_drive">Test drive</ToggleButton>
                <ToggleButton value="visit">Store visit</ToggleButton>
              </ToggleButtonGroup>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Day</Typography>
                <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                  {info.days.map((d) => (
                    <Chip key={d.date} label={d.closed ? `${dayLabel(d.date)} · closed` : dayLabel(d.date)} disabled={d.closed}
                      color={d.date === day ? 'primary' : 'default'} variant={d.date === day ? 'filled' : 'outlined'}
                      onClick={() => { setDate(d.date); setStart(null); }} />
                  ))}
                </Box>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Time</Typography>
                {!slotsReady ? <CircularProgress size={22} /> : slots.error ? <Alert severity="error">{slots.error}</Alert> : !slots.slots.length ? (
                  <Typography color="text.secondary">No times left this day — please pick another day.</Typography>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1 }}>
                    {slots.slots.map((s) => (
                      <Button key={s.start} variant={start === s.start ? 'contained' : 'outlined'} onClick={() => setStart(s.start)}>{s.label}</Button>
                    ))}
                  </Box>
                )}
              </Box>
              <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField label="Mobile phone" value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" autoComplete="tel"
                helperText="We'll text you a reminder." slotProps={{ htmlInput: { maxLength: 20 } }} />
              <TextField label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" slotProps={{ htmlInput: { maxLength: 120 } }} />
              <TextField label="Anything we should know? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} />
              {error && <Alert severity="error">{error}</Alert>}
              <Button type="submit" variant="contained" size="large" disabled={busy || !start} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
                {start ? `Book ${dayLabel(day)} at ${slots.slots.find((s) => s.start === start)?.label || ''}` : 'Pick a time'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </PublicShell>
  );
};

export default BookPublicPage;
