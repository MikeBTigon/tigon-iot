// Track 3 — customer page /prequal?store=&lead=: a short pre-qualification form, then the lenders' soft-pull links.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, InputAdornment, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { CheckCircle, OpenInNew } from '@mui/icons-material';
import PublicShell from '../public/PublicShell';
import { publicGet, publicPost } from '../public/publicApi';
import { CREDIT_RANGES } from './closingUtils';
import { useT } from '../../../i18n';
import ConsentCheckbox from '../public/ConsentCheckbox';
import { consentPayload } from '../public/consent';

interface StoreInfo { id: string; name: string; city: string; address: string; phone: string }
interface Lender { name: string; url: string; note: string }

const PrequalPublicPage: React.FC = () => {
  const t = useT();
  const [params] = useSearchParams();
  const store = params.get('store') || '';
  const lead = params.get('lead') || '';
  const [info, setInfo] = useState<{ enabled: boolean; intro: string; store: StoreInfo | null } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [credit, setCredit] = useState('');
  const [budget, setBudget] = useState('');
  const [down, setDown] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ lenders: Lender[]; store: StoreInfo | null } | null>(null);

  useEffect(() => {
    publicGet<{ enabled: boolean; intro: string; store: StoreInfo | null }>(`prequal/info?store=${encodeURIComponent(store)}`)
      .then(setInfo).catch(() => setInfo({ enabled: true, intro: '', store: null }));
  }, [store]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!credit) { setError(t('prequal.pickCredit')); return; }
    setBusy(true);
    try {
      const r = await publicPost<{ lenders: Lender[]; store: StoreInfo | null }>('prequal/submit', {
        name, phone, email, creditRange: credit, monthlyBudget: budget, downPayment: down, ...consentPayload(consent), store, lead,
      });
      setDone(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const phoneNum = done?.store?.phone || info?.store?.phone || '1-844-844-6638';

  if (done) {
    return (
      <PublicShell title={t('prequal.doneTitle')} subtitle={t('prequal.doneSubtitle')} phone={phoneNum}>
        <Alert icon={<CheckCircle />} severity="success" sx={{ mb: 2 }}>
          {done.store ? t('prequal.gotInfoStore', { city: done.store.city }) : t('prequal.gotInfo')}
        </Alert>
        <Stack spacing={1.5}>
          {done.lenders.map((l) => (
            <Card key={l.name} variant="outlined">
              <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', '&:last-child': { pb: 2 } }}>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography sx={{ fontWeight: 700 }}>{l.name}</Typography>
                  {l.note && <Typography variant="body2" color="text.secondary">{l.note}</Typography>}
                </Box>
                {l.url ? (
                  <Box sx={{ textAlign: 'right' }}>
                    <Button variant="contained" endIcon={<OpenInNew />} href={l.url} target="_blank" rel="noopener noreferrer">
                      {t('prequal.applyWith', { name: l.name.split(' ')[0] })}
                    </Button>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>{t('prequal.noAffect')}</Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">{t('prequal.askSalesperson')}</Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('prequal.questions')} <a href={`tel:${phoneNum.replace(/[^\d+]/g, '')}`}>{phoneNum}</a>.
        </Typography>
      </PublicShell>
    );
  }

  return (
    <PublicShell title={t('prequal.title')} subtitle={info?.intro || t('prequal.subtitle')} phone={phoneNum}>
      {info && !info.enabled && <Alert severity="info" sx={{ mb: 2 }}>{t('prequal.unavailable', { phone: phoneNum })}</Alert>}
      <Card>
        <CardContent component="form" onSubmit={submit}>
          <Stack spacing={2}>
            <TextField label={t('pub.yourName')} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField label={t('pub.mobile')} value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" autoComplete="tel" slotProps={{ htmlInput: { maxLength: 20 } }} />
            <TextField label={t('pub.emailOptional')} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" slotProps={{ htmlInput: { maxLength: 120 } }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>{t('prequal.creditQuestion')}</Typography>
              <ToggleButtonGroup exclusive value={credit} onChange={(_e, v) => v && setCredit(v)} orientation="vertical" fullWidth>
                {CREDIT_RANGES.map((c) => (
                  <ToggleButton key={c.id} value={c.id} sx={{ justifyContent: 'space-between', textTransform: 'none' }}>
                    <b>{t(`prequal.credit.${c.id}`, { defaultValue: c.label })}</b><span>{t(`prequal.credit.${c.id}Hint`, { defaultValue: c.hint })}</span>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField label={t('prequal.budget')} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal"
                slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: <InputAdornment position="end">{t('prequal.perMonth')}</InputAdornment> }, htmlInput: { maxLength: 8 } }} />
              <TextField label={t('prequal.down')} value={down} onChange={(e) => setDown(e.target.value)} inputMode="decimal"
                slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { maxLength: 8 } }} />
            </Box>
            <ConsentCheckbox checked={consent} onChange={setConsent} />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={busy || (info ? !info.enabled : false)} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
              {t('prequal.submit')}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {t('prequal.disclaimer')}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </PublicShell>
  );
};

export default PrequalPublicPage;
