// Track 5 — public referral page /r/:code: "<Name> thinks you'll love a TIGON golf cart" + a short contact form.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle } from '@mui/icons-material';
import PublicShell from '../public/PublicShell';
import { publicGet, publicPost } from '../public/publicApi';
import { DEALERSHIPS, DEALERSHIP_BY_ID } from '../../constants';
import { useT } from '../../../i18n';
import ConsentCheckbox from '../public/ConsentCheckbox';
import { consentPayload } from '../public/consent';

interface ReferralInfo { code: string; firstName: string; storeId: string; storeName: string; phone: string }

const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');

const ReferralPublicPage: React.FC = () => {
  const t = useT();
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
    if (!form.name.trim()) return setError(t('referral.enterName'));
    if (form.phone.replace(/\D/g, '').length < 10) return setError(t('referral.enterPhone'));
    // Texting consent is optional ("Consent is not required to buy"): we text only when it is checked.
    setBusy(true);
    try {
      await publicPost('referral/submit', { ...form, storeId, code, ...consentPayload(form.consent) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('referral.genericError'));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <PublicShell><Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box></PublicShell>;
  }
  if (!ref) {
    return (
      <PublicShell title={t('referral.notFoundTitle')} phone={phone}>
        <Alert severity="info" sx={{ mb: 2 }}>{loaded.error || t('referral.inactive')}</Alert>
        <Button variant="contained" href="https://tigongolfcarts.com">{t('referral.seeStock')}</Button>
      </PublicShell>
    );
  }
  if (done) {
    return (
      <PublicShell title={t('referral.doneTitle')} phone={phone}>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle color="success" sx={{ fontSize: 56 }} />
          <Typography sx={{ mt: 1 }}>
            {t('referral.doneBody', { city: storeId ? (DEALERSHIP_BY_ID[storeId]?.cityState || '').split(',')[0] : '' }).replace(/\s+/g, ' ')}
            {' '}{t('referral.cantWait')} <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>.
          </Typography>
          <Button sx={{ mt: 2 }} variant="outlined" href="https://tigongolfcarts.com">{t('referral.browse')}</Button>
        </Paper>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title={t('referral.title', { name: ref.firstName })}
      subtitle={t('referral.subtitle')}
      phone={phone}
    >
      <Paper component="form" onSubmit={submit} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <TextField label={t('pub.yourName')} value={form.name} onChange={set('name')} required autoComplete="name" />
          <TextField label={t('pub.mobile')} value={form.phone} onChange={set('phone')} required type="tel" autoComplete="tel" />
          <TextField label={t('pub.emailOptional')} value={form.email} onChange={set('email')} type="email" autoComplete="email" />
          <TextField label={t('referral.interest')} value={form.interest} onChange={set('interest')} multiline minRows={2}
            placeholder={t('referral.interestHint')} />
          <TextField select label={t('referral.closestStore')} value={storeId} onChange={set('storeId')}>
            <MenuItem value="">{t('pub.notSure')}</MenuItem>
            {STORES.map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState || d.name}</MenuItem>)}
          </TextField>
          {/* Hidden from people; bots fill it in. */}
          <Box sx={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden>
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} name="website" />
          </Box>
          <ConsentCheckbox checked={form.consent} onChange={(v) => setForm((f) => ({ ...f, consent: v }))} />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? t('pub.sending') : t('pub.send')}</Button>
        </Stack>
      </Paper>
    </PublicShell>
  );
};

export default ReferralPublicPage;
