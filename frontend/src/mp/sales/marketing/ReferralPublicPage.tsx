// Track 5 — public referral page /r/:code: "<Name> thinks you'll love a TIGON golf cart" + a short contact form.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle } from '@mui/icons-material';
import PublicShell from '../public/PublicShell';
import { publicGet, publicPost } from '../public/publicApi';
import { DEALERSHIPS, DEALERSHIP_BY_ID } from '../../constants';

interface ReferralInfo { code: string; firstName: string; storeId: string; storeName: string; phone: string }

const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');

const ReferralPublicPage: React.FC = () => {
  const { code = '' } = useParams();
  const [info, setInfo] = useState<{ code: string; data: ReferralInfo | null; error: string } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', interest: '', storeId: '', consent: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    publicGet<ReferralInfo>(`referral/get/${encodeURIComponent(code)}`)
      .then((data) => { if (alive) setInfo({ code, data, error: '' }); })
      .catch((e: Error) => { if (alive) setInfo({ code, data: null, error: e.message }); });
    return () => { alive = false; };
  }, [code]);

  const loaded = info?.code === code ? info : null;
  const ref = loaded?.data || null;
  const storeId = form.storeId || ref?.storeId || '';
  const phone = (storeId && DEALERSHIP_BY_ID[storeId]?.phone) || ref?.phone || '1-844-844-6638';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Please enter your name.');
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Please enter a 10-digit phone number.');
    if (!form.consent) return setError('Please tick the box so we can contact you.');
    setBusy(true);
    try {
      await publicPost('referral/submit', { ...form, storeId, code });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please call us instead.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <PublicShell><Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box></PublicShell>;
  }
  if (!ref) {
    return (
      <PublicShell title="Find your golf cart at TIGON" phone={phone}>
        <Alert severity="info" sx={{ mb: 2 }}>{loaded.error || 'This referral link is not active.'}</Alert>
        <Button variant="contained" href="https://tigongolfcarts.com">See golf carts in stock</Button>
      </PublicShell>
    );
  }
  if (done) {
    return (
      <PublicShell title="Thanks! We'll be in touch soon." phone={phone}>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle color="success" sx={{ fontSize: 56 }} />
          <Typography sx={{ mt: 1 }}>
            Someone from TIGON Golf Carts{storeId ? ` ${(DEALERSHIP_BY_ID[storeId]?.cityState || '').split(',')[0]}` : ''} will call or text you shortly.
            Can't wait? Call us at <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>.
          </Typography>
          <Button sx={{ mt: 2 }} variant="outlined" href="https://tigongolfcarts.com">Browse carts while you wait</Button>
        </Paper>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title={`${ref.firstName} thinks you'll love a TIGON golf cart`}
      subtitle="Tell us what you're looking for and we'll send you options, prices and photos — no pressure."
      phone={phone}
    >
      <Paper component="form" onSubmit={submit} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <TextField label="Your name" value={form.name} onChange={set('name')} required autoComplete="name" />
          <TextField label="Mobile phone" value={form.phone} onChange={set('phone')} required type="tel" autoComplete="tel" />
          <TextField label="Email (optional)" value={form.email} onChange={set('email')} type="email" autoComplete="email" />
          <TextField label="What are you looking for?" value={form.interest} onChange={set('interest')} multiline minRows={2}
            placeholder="e.g. 4-seater, lifted, lithium battery, under $12,000" />
          <TextField select label="Closest store" value={storeId} onChange={set('storeId')}>
            <MenuItem value="">Not sure</MenuItem>
            {STORES.map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState || d.name}</MenuItem>)}
          </TextField>
          {/* Hidden from people; bots fill it in. */}
          <Box sx={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden>
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} name="website" />
          </Box>
          <FormControlLabel
            control={<Checkbox checked={form.consent} onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} />}
            label={<Typography variant="body2">Yes, TIGON Golf Carts may call, text or email me about golf carts. Message and data rates may apply. Reply STOP to opt out.</Typography>}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Sending…' : 'Send'}</Button>
        </Stack>
      </Paper>
    </PublicShell>
  );
};

export default ReferralPublicPage;
