import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, FormControl, FormControlLabel, InputLabel, ListItemText,
  MenuItem, OutlinedInput, Paper, Select, Switch, TextField, Typography,
} from '@mui/material';
import { ContentCopy, OpenInNew, IosShare, Save } from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import { formatPrice } from '../cartUtils';
import { COLLECTIONS, DEALERSHIPS, storefrontUrl } from '../constants';
import { copyText, openExternal } from '../../native/actions';
import { isNativeApp } from '../../native/platform';
import { logEvent } from '../../native/deviceSession';
import { writeAudit } from '../audit';
import type { Storefront } from '../growthTypes';
import type { MpCart } from '../types';
import { clearStorefrontSlugCache, findMyStorefront, getOrCreateLink } from './links';
import { nativeShare } from './shareActions';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');

type Form = Omit<Storefront, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { slug: string };

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Mini-storefront editor: your public page at /s/{slug}. */
const StorefrontEditor: React.FC = () => {
  const { profile, carts, isAdmin } = useMp();
  const [existing, setExisting] = useState<Storefront | null | undefined>(undefined);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!profile) return;
    let live = true;
    findMyStorefront(profile.uid)
      .then((sf) => {
        if (!live) return;
        setExisting(sf);
        setForm(sf ? { ...sf, slug: sf.id } : {
          slug: toSlug(profile.name) || '',
          title: `${profile.name} · TIGON Golf Carts`,
          tagline: 'New & pre-owned golf carts · financing & delivery available',
          phone: '',
          locationIds: [],
          pinnedCartIds: [],
          showNew: true,
          showUsed: true,
          published: true,
        });
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [profile]);

  const cartById = useMemo(() => new Map(carts.map((c) => [c.docId, c])), [carts]);
  if (!profile || existing === undefined || !form) {
    return <MpShell>{error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}</MpShell>;
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const slugError = !SLUG_RE.test(form.slug)
    ? '3–40 characters: lowercase letters, numbers and dashes'
    : form.slug === 'tigon' && !isAdmin ? '"tigon" is reserved for the company storefront' : '';
  const url = storefrontUrl(existing?.id || form.slug);
  const label = (c: MpCart) => `${c.year} ${cartTitle(c)} · ${formatPrice(c.price)}`;

  const save = async () => {
    if (slugError) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const slug = existing?.id || form.slug;
      const ref = doc(db, COLLECTIONS.storefronts, slug);
      if (!existing && (await getDoc(ref)).exists()) {
        setError(`"${slug}" is already taken — pick another address.`);
        return;
      }
      const now = Date.now();
      const data: Omit<Storefront, 'id'> = {
        userId: existing?.userId || profile.uid,
        title: form.title.trim(),
        tagline: form.tagline.trim(),
        phone: form.phone.trim(),
        locationIds: form.locationIds,
        pinnedCartIds: form.pinnedCartIds,
        showNew: form.showNew,
        showUsed: form.showUsed,
        published: form.published,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await setDoc(ref, data);
      setExisting({ ...data, id: slug });
      clearStorefrontSlugCache();
      writeAudit(profile, existing ? 'storefront_update' : 'storefront_create', slug, form.published ? 'published' : 'hidden');
      setMsg(existing ? 'Saved. The public page updates within about 5 minutes.' : 'Storefront created!');
    } catch (e) {
      setError((e as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const shareStorefront = async () => {
    if (!existing) return;
    try {
      const link = await getOrCreateLink({ platform: 'storefront', campaign: 'storefront', slug: existing.id });
      const text = `${existing.title}\n${existing.tagline}\n${link}`;
      await copyText(text).catch(() => undefined);
      if (isNativeApp()) await nativeShare({ title: existing.title, text });
      else if (navigator.share) await navigator.share({ title: existing.title, text: `${existing.title}\n${existing.tagline}`, url: link });
      else setMsg('Link copied.');
      logEvent(profile.uid, 'share', { message: 'storefront' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  };

  return (
    <MpShell>
      <Typography variant="h5" gutterBottom>My storefront</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        A public page with live in-stock carts that anyone can open — no sign-in. Share it in your bio, texts and emails.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Address"
            value={form.slug}
            disabled={!!existing}
            onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            error={!!slugError}
            helperText={existing ? 'The address can\'t be changed after creating the storefront.' : slugError || `tigon-iot.web.app/s/${form.slug}`}
          />
          <TextField label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
          <TextField label="Tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} slotProps={{ htmlInput: { maxLength: 140 } }} />
          <TextField label="Phone (call/text)" value={form.phone} onChange={(e) => set('phone', e.target.value)} helperText="Leave empty to use the store / company number." />
          <FormControl>
            <InputLabel>Locations</InputLabel>
            <Select
              multiple
              value={form.locationIds}
              onChange={(e) => set('locationIds', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              input={<OutlinedInput label="Locations" />}
              renderValue={(v) => (v.length ? v.join(', ') : 'All locations')}
              displayEmpty
            >
              {STORES.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  <Checkbox checked={form.locationIds.includes(d.id)} />
                  <ListItemText primary={`${d.id} · ${d.cityState}`} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel control={<Switch checked={form.showNew} onChange={(e) => set('showNew', e.target.checked)} />} label="Show new carts" />
            <FormControlLabel control={<Switch checked={form.showUsed} onChange={(e) => set('showUsed', e.target.checked)} />} label="Show used carts" />
          </Box>
          <Autocomplete
            multiple
            options={carts}
            value={form.pinnedCartIds.map((id) => cartById.get(id)).filter((c): c is MpCart => !!c)}
            onChange={(_, v) => set('pinnedCartIds', v.map((c) => c.docId))}
            getOptionLabel={label}
            isOptionEqualToValue={(a, b) => a.docId === b.docId}
            filterOptions={(opts, s) => {
              const q = s.inputValue.toLowerCase().trim();
              return (q ? opts.filter((c) => `${label(c)} ${c.serial} ${c.locationId}`.toLowerCase().includes(q)) : opts).slice(0, 50);
            }}
            renderInput={(p) => <TextField {...p} label="Pinned carts (shown first)" placeholder="Search carts" />}
          />
          <FormControlLabel control={<Switch checked={form.published} onChange={(e) => set('published', e.target.checked)} />} label="Published (visible to the public)" />
          <Box>
            <Button variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save />} disabled={saving || !!slugError || !form.title.trim()} onClick={save}>
              {existing ? 'Save' : 'Create storefront'}
            </Button>
          </Box>
        </Paper>

        <Paper sx={{ p: 2, alignSelf: 'start' }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>Your public page</Typography>
          {existing ? (
            <>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                <Chip color={existing.published ? 'success' : 'default'} label={existing.published ? 'Published' : 'Hidden'} size="small" />
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{url}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Button size="small" startIcon={<ContentCopy />} onClick={() => copyText(url).then(() => setMsg('Link copied.'))}>Copy</Button>
                <Button size="small" startIcon={<OpenInNew />} onClick={() => openExternal(url)}>Open</Button>
                <Button size="small" variant="contained" startIcon={<IosShare />} onClick={shareStorefront} disabled={!existing.published}>Share storefront</Button>
              </Box>
              <Box sx={{ bgcolor: '#fff', p: 1, width: 200, maxWidth: '100%' }}>
                <QRCodeSVG value={url} size={400} marginSize={2} style={{ width: '100%', height: 'auto' }} />
              </Box>
            </>
          ) : (
            <Typography color="text.secondary">Create your storefront to get a link and QR code.</Typography>
          )}
        </Paper>
      </Box>
    </MpShell>
  );
};

export default StorefrontEditor;
