// Track 3 — customer page /trade?store=&lead=: trade-in details + photos → an estimated value range.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, CircularProgress, IconButton, MenuItem, Radio, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { AddAPhoto, CheckCircle, Close } from '@mui/icons-material';
import PublicShell from '../public/PublicShell';
import { publicGet, publicPost } from '../public/publicApi';
import { compressImage } from '../../create/media';
import { TRADE_CONDITIONS, money0 } from './closingUtils';

interface StoreInfo { id: string; name: string; city: string; address: string; phone: string }
const MAX_PHOTOS = 6;
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 2 - 1995 }, (_v, i) => THIS_YEAR + 1 - i);

const toDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the photo.'));
  r.readAsDataURL(b);
});

const TradePublicPage: React.FC = () => {
  const [params] = useSearchParams();
  const store = params.get('store') || '';
  const lead = params.get('lead') || '';
  const [info, setInfo] = useState<{ enabled: boolean; brands: string[]; store: StoreInfo | null } | null>(null);
  const [year, setYear] = useState<number | ''>('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [electric, setElectric] = useState(true);
  const [batteryYear, setBatteryYear] = useState<number | ''>('');
  const [lifted, setLifted] = useState(false);
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ low: number; high: number; store: StoreInfo | null } | null>(null);

  useEffect(() => {
    publicGet<{ enabled: boolean; brands: string[]; store: StoreInfo | null }>(`trade/info?store=${encodeURIComponent(store)}`)
      .then(setInfo).catch(() => setInfo({ enabled: true, brands: [], store: null }));
  }, [store]);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setProcessing(true);
    setError('');
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room);
      const out: string[] = [];
      for (const f of picked) out.push(await toDataUrl(await compressImage(f, 1600, 0.82)));
      setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
      if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!year) { setError('Please pick the year.'); return; }
    if (!brand.trim()) { setError('Please enter the brand.'); return; }
    if (!condition) { setError('Please pick the condition.'); return; }
    setBusy(true);
    try {
      const r = await publicPost<{ low: number; high: number; store: StoreInfo | null }>('trade/submit', {
        year, brand: brand.trim(), model, electric, batteryYear: electric ? batteryYear || undefined : undefined, lifted, condition, notes,
        photos, name, phone, email, store, lead,
      });
      setResult(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const phoneNum = result?.store?.phone || info?.store?.phone || '1-844-844-6638';

  if (result) {
    return (
      <PublicShell title="Your trade-in estimate" phone={phoneNum}>
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle color="success" sx={{ fontSize: 48 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>Estimated trade-in value</Typography>
            <Typography sx={{ fontWeight: 900, fontSize: { xs: 34, sm: 44 }, color: '#0e4671' }}>{money0(result.low)} – {money0(result.high)}</Typography>
            <Typography color="text.secondary">Final value after a quick inspection.</Typography>
          </CardContent>
        </Card>
        <Alert severity="info">
          We sent this to {result.store ? `TIGON ${result.store.city}` : 'our team'}. A salesperson will reach out soon. Bring your cart by any time — or call us at {phoneNum}.
        </Alert>
      </PublicShell>
    );
  }

  return (
    <PublicShell title="What's my golf cart worth?" subtitle="Tell us about your cart and get an estimated trade-in value in about 2 minutes." phone={phoneNum}>
      {info && !info.enabled && <Alert severity="info" sx={{ mb: 2 }}>Online trade-in values are not available right now. Please call us at {phoneNum}.</Alert>}
      <Card>
        <CardContent component="form" onSubmit={submit}>
          <Stack spacing={2}>
            <Typography sx={{ fontWeight: 700 }}>Your cart</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '120px 1fr 1fr' }, gap: 2 }}>
              <TextField select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} required>
                {YEARS.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </TextField>
              <Autocomplete freeSolo options={info?.brands || []} inputValue={brand} onInputChange={(_e, v) => setBrand(v.slice(0, 40))}
                renderInput={(p) => <TextField {...p} label="Brand" required />} />
              <TextField label="Model (optional)" value={model} onChange={(e) => setModel(e.target.value)} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
                slotProps={{ htmlInput: { maxLength: 60 } }} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <ToggleButtonGroup exclusive fullWidth value={electric ? 'e' : 'g'} onChange={(_e, v) => v && setElectric(v === 'e')}>
                <ToggleButton value="e">Electric</ToggleButton>
                <ToggleButton value="g">Gas</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup exclusive fullWidth value={lifted ? 'y' : 'n'} onChange={(_e, v) => v && setLifted(v === 'y')}>
                <ToggleButton value="n">Not lifted</ToggleButton>
                <ToggleButton value="y">Lifted</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {electric && (
              <TextField select label="Battery year" value={batteryYear} onChange={(e) => setBatteryYear(e.target.value === '' ? '' : Number(e.target.value))}
                helperText="When were the batteries last replaced? Pick 'Not sure' if you don't know.">
                <MenuItem value="">Not sure</MenuItem>
                {YEARS.filter((y) => y <= THIS_YEAR).map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </TextField>
            )}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Condition</Typography>
              <Stack spacing={1}>
                {TRADE_CONDITIONS.map((c) => (
                  <Box key={c.id} onClick={() => setCondition(c.id)} role="radio" aria-checked={condition === c.id}
                    sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, border: 1, borderRadius: 1, cursor: 'pointer', borderColor: condition === c.id ? 'primary.main' : 'divider', bgcolor: condition === c.id ? 'action.selected' : undefined }}>
                    <Radio checked={condition === c.id} size="small" sx={{ p: 0.25 }} />
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{c.label}</Typography>
                      <Typography variant="body2" color="text.secondary">{c.hint}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
            <TextField label="Anything else? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2}
              placeholder="Upgrades, new tires, enclosure, known issues…" slotProps={{ htmlInput: { maxLength: 500 } }} />

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Photos (up to {MAX_PHOTOS}, optional)</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {photos.map((p, i) => (
                  <Box key={i} sx={{ position: 'relative', width: 96, height: 72 }}>
                    <Box component="img" src={p} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }} />
                    <IconButton size="small" onClick={() => setPhotos((x) => x.filter((_v, j) => j !== i))} aria-label="Remove photo"
                      sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,.55)', color: '#fff', p: 0.25, '&:hover': { bgcolor: 'rgba(0,0,0,.75)' } }}>
                      <Close fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Button component="label" variant="outlined" sx={{ width: 96, height: 72 }} disabled={processing}>
                    {processing ? <CircularProgress size={20} /> : <AddAPhoto />}
                    <input hidden type="file" accept="image/*" multiple onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
                  </Button>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">Front, side, seats and the battery area help us give you a closer number.</Typography>
            </Box>

            <Typography sx={{ fontWeight: 700, pt: 1 }}>Your info</Typography>
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField label="Mobile phone" value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" autoComplete="tel" slotProps={{ htmlInput: { maxLength: 20 } }} />
            <TextField label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" slotProps={{ htmlInput: { maxLength: 120 } }} />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={busy || processing || (info ? !info.enabled : false)}
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
              {busy ? 'Sending…' : 'Get my estimate'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </PublicShell>
  );
};

export default TradePublicPage;
