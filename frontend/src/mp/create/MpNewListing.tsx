import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Step,
  StepLabel, Stepper, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  AddPhotoAlternate, ArrowBack, ArrowForward, AutoAwesome, Close, PhotoCamera, PhotoFilter, Save, Star, StarBorder,
} from '@mui/icons-material';
import { db, functions } from '../../config/firebase';
import { logEvent } from '../../native/deviceSession';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, DEALERSHIPS, locationName } from '../constants';
import { cartTitle } from '../cartLogic';
import { formatPrice } from '../cartUtils';
import { fillTemplate, useTemplates } from '../templates';
import { writeAudit } from '../audit';
import PhotoStudio from './PhotoStudio';
import VoiceButton from './VoiceButton';
import { compressImage, uploadMedia } from './media';
import {
  CATEGORIES, EMPTY_FORM, cartDocFields, formFromPayload, newCartFields, parsePayload, parsePrice, previewCart,
  type ListingCategory, type ListingForm,
} from './listingModel';

type Json = Record<string, unknown>;

interface PhotoItem {
  key: string;
  /** Local (compressed) image, when taken/picked in this session. */
  blob?: Blob;
  /** Download URL once uploaded (or the existing URL when editing). */
  url?: string;
  preview: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

interface AiSnapResult {
  make: string | null;
  model: string | null;
  year: string | null;
  color: string | null;
  seatColor: string | null;
  passengers: number | null;
  isElectric: boolean | null;
  batteryType: string | null;
  isLifted: boolean | null;
  isStreetLegal: boolean | null;
  hasSoundSystem: boolean | null;
  hasExtendedTop: boolean | null;
  isUsed: boolean | null;
  category: ListingCategory;
  title: string;
  description: string;
  suggestedPrice: number | null;
  priceReason: string;
}

interface AiSnapRequest {
  photoUrls: string[];
  text: string;
  comparables: Array<{ make: string; model: string; year: string; price: number }>;
}

const mpAiSnap = httpsCallable<AiSnapRequest, AiSnapResult>(functions, 'mpAiSnap');

const STEPS = ['Photos', 'Details', 'Review & save'];
const MAX_PHOTOS = 20;

function aiError(e: unknown): { message: string; unavailable: boolean } {
  const err = (e ?? {}) as { code?: string; message?: string };
  const code = (err.code || '').replace(/^functions\//, '');
  const msg = err.message || '';
  if (code === 'failed-precondition' || code === 'not-found' || /not (been )?deployed|does not exist|ANTHROPIC_API_KEY/i.test(msg)) {
    return { message: "AI fill isn't set up yet — fill in the form below (it only takes a minute).", unavailable: true };
  }
  if (code === 'internal' && (!msg || /^internal$/i.test(msg))) {
    return { message: 'AI fill could not be reached. Fill in the form manually or try again later.', unavailable: false };
  }
  return { message: msg || 'AI fill failed. Try again.', unavailable: false };
}

let keySeq = 0;
const newKey = () => `p${Date.now()}_${keySeq++}`;

/** New listing / Snap-to-list: photos → AI or manual details → save as a manual mp_carts listing. */
export default function MpNewListing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit') || '';
  const { profile, carts, refreshCart } = useMp();
  const uid = profile?.uid;
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const templates = useTemplates('listing', uid);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ListingForm>(EMPTY_FORM);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [note, setNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ severity: 'info' | 'success' | 'warning'; text: string } | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [suggestion, setSuggestion] = useState<{ price: number | null; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [studio, setStudio] = useState<number | null>(null);
  const [editRaw, setEditRaw] = useState<Json | null>(null);
  const [editState, setEditState] = useState<'none' | 'loading' | 'ready' | 'denied' | 'missing'>(editId ? 'loading' : 'none');
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pickRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<PhotoItem[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  // Revoke local previews on unmount.
  useEffect(() => () => photosRef.current.forEach((p) => p.blob && URL.revokeObjectURL(p.preview)), []);

  const set = <K extends keyof ListingForm>(k: K, v: ListingForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ---- Edit mode: prefill from the existing manual listing ------------------
  useEffect(() => {
    if (!editId || !profile) return;
    let alive = true;
    getDoc(doc(db, COLLECTIONS.carts, editId))
      .then((snap) => {
        if (!alive) return;
        if (!snap.exists()) return setEditState('missing');
        const d = snap.data();
        if (d.source !== 'manual' || !(d.createdBy === profile.uid || isManager)) return setEditState('denied');
        const raw = parsePayload(d.payload);
        setEditRaw(raw);
        setForm(formFromPayload(raw));
        const urls = (Array.isArray(raw.imageUrls) ? raw.imageUrls : []).map(String).filter(Boolean);
        setPhotos(urls.map((url) => ({ key: newKey(), url, preview: url, status: 'ready' })));
        setEditState('ready');
        setStep(1);
      })
      .catch((e) => alive && (setError(e.message), setEditState('missing')));
    return () => {
      alive = false;
    };
  }, [editId, profile, isManager]);

  // ---- Photos --------------------------------------------------------------
  const upload = useCallback(
    async (key: string, file: Blob, name: string) => {
      if (!uid) return;
      try {
        const small = await compressImage(file);
        const preview = URL.createObjectURL(small);
        setPhotos((ps) => ps.map((p) => {
          if (p.key !== key) return p;
          if (p.blob) URL.revokeObjectURL(p.preview);
          return { ...p, blob: small, preview };
        }));
        const url = await uploadMedia(uid, small, name);
        setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, url, status: 'ready', error: undefined } : p)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'error', error: msg } : p)));
      }
    },
    [uid],
  );

  const addFiles = (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    const room = MAX_PHOTOS - photos.length;
    if (!list.length) return;
    if (list.length > room) setError(`Up to ${MAX_PHOTOS} photos per listing.`);
    const items = list.slice(0, Math.max(0, room)).map((f) => ({
      file: f,
      item: { key: newKey(), blob: f, preview: URL.createObjectURL(f), status: 'uploading' as const },
    }));
    setPhotos((ps) => [...ps, ...items.map((i) => i.item)]);
    for (const { file, item } of items) void upload(item.key, file, file.name || 'photo.jpg');
  };

  const removePhoto = (key: string) =>
    setPhotos((ps) => {
      const p = ps.find((x) => x.key === key);
      if (p?.blob) URL.revokeObjectURL(p.preview);
      return ps.filter((x) => x.key !== key);
    });

  const makeCover = (key: string) => setPhotos((ps) => [...ps.filter((p) => p.key === key), ...ps.filter((p) => p.key !== key)]);

  const retry = (p: PhotoItem) => {
    if (!p.blob) return;
    setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, status: 'uploading', error: undefined } : x)));
    void upload(p.key, p.blob, 'photo.jpg');
  };

  const readyUrls = photos.filter((p) => p.status === 'ready' && p.url).map((p) => p.url as string);
  const uploading = photos.some((p) => p.status === 'uploading');
  const failed = photos.filter((p) => p.status === 'error').length;

  // ---- AI fill -------------------------------------------------------------
  const comparables = useMemo(() => {
    const priced = carts.filter((c) => c.price > 0 && c.make);
    let make = form.make.trim().toLowerCase();
    if (!make && note) {
      const makes = [...new Set(priced.map((c) => c.make.toLowerCase()))];
      make = makes.find((m) => m.length > 2 && note.toLowerCase().includes(m)) || '';
    }
    const same = make ? priced.filter((c) => c.make.toLowerCase() === make) : [];
    const year = Number(form.year) || 0;
    const pool = same.length ? same : priced;
    return pool
      .slice()
      .sort((a, b) => (year ? Math.abs((Number(a.year) || 0) - year) - Math.abs((Number(b.year) || 0) - year) : 0) || b.savedAt - a.savedAt)
      .slice(0, 10)
      .map((c) => ({ make: c.make, model: c.model, year: c.year, price: c.price }));
  }, [carts, form.make, form.year, note]);

  const runAi = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const { data: r } = await mpAiSnap({ photoUrls: readyUrls.slice(0, 3), text: note.trim(), comparables });
      setForm((f) => {
        const n = { ...f };
        const s = (k: 'make' | 'model' | 'year' | 'color' | 'seatColor' | 'batteryType', v: string | null) => {
          if (v) n[k] = v;
        };
        const b = (k: 'isElectric' | 'isLifted' | 'isStreetLegal' | 'hasSoundSystem' | 'hasExtendedTop' | 'isUsed', v: boolean | null) => {
          if (v !== null && v !== undefined) n[k] = v;
        };
        s('make', r.make);
        s('model', r.model);
        s('year', r.year);
        s('color', r.color);
        s('seatColor', r.seatColor);
        s('batteryType', r.batteryType);
        if (r.passengers) n.passengers = String(r.passengers);
        b('isElectric', r.isElectric);
        b('isLifted', r.isLifted);
        b('isStreetLegal', r.isStreetLegal);
        b('hasSoundSystem', r.hasSoundSystem);
        b('hasExtendedTop', r.hasExtendedTop);
        b('isUsed', r.isUsed);
        if (r.category) n.category = r.category;
        if (r.description) n.description = r.description;
        return n;
      });
      setSuggestion({ price: r.suggestedPrice, reason: r.priceReason });
      setAiMsg({ severity: 'success', text: 'Filled what the AI could see or hear. Check every field before saving.' });
      if (uid) void logEvent(uid, 'ai_listing', { message: 'snap' });
      setStep(1);
    } catch (e) {
      const { message, unavailable } = aiError(e);
      if (unavailable) setAiUnavailable(true);
      setAiMsg({ severity: unavailable ? 'info' : 'warning', text: message });
    } finally {
      setAiBusy(false);
    }
  };

  // ---- Studio (edit a photo in place) -------------------------------------
  const studioSources = useMemo(() => photos.map((p) => p.blob || p.url || p.preview), [photos]);
  const applyStudio = async (blob: Blob, index: number) => {
    const p = photos[index];
    if (!p) return;
    const preview = URL.createObjectURL(blob);
    setPhotos((ps) => ps.map((x) => {
      if (x.key !== p.key) return x;
      if (x.blob) URL.revokeObjectURL(x.preview);
      return { ...x, blob, preview, status: 'uploading', url: undefined };
    }));
    if (!uid) return;
    try {
      const url = await uploadMedia(uid, blob, 'studio.jpg');
      setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, url, status: 'ready' } : x)));
    } catch (e) {
      setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, status: 'error', error: String(e) } : x)));
      throw e;
    }
  };

  // ---- Save ----------------------------------------------------------------
  const cart = useMemo(() => previewCart(form, readyUrls), [form, readyUrls]);
  const price = parsePrice(form.price);
  const problems = [
    !form.make.trim() && !form.model.trim() ? 'Add the make or model.' : '',
    !price ? 'Add a price.' : '',
    !form.locationId ? 'Pick the store location.' : '',
  ].filter(Boolean);

  const save = async () => {
    if (!uid || !profile) return;
    setError('');
    if (problems.length) return setError(problems.join(' '));
    if (uploading) return setError('Wait for the photos to finish uploading.');
    setSaving(true);
    try {
      if (editId) {
        const ref = doc(db, COLLECTIONS.carts, editId);
        await updateDoc(ref, cartDocFields(form, editId, readyUrls, editRaw || {}));
        await writeAudit(profile, 'listing.edit', editId, cartTitle(cart));
        await refreshCart(editId);
        navigate(`/mp/cart/${editId}`);
      } else {
        const ref = doc(collection(db, COLLECTIONS.carts));
        await setDoc(ref, { ...cartDocFields(form, ref.id, readyUrls), ...newCartFields(uid) });
        await logEvent(uid, 'listing_created', { cartId: ref.id });
        await refreshCart(ref.id);
        navigate(`/mp/cart/${ref.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ---- Render --------------------------------------------------------------
  if (editId && editState !== 'ready') {
    return (
      <MpShell>
        {editState === 'loading' && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}
        {editState === 'missing' && <Alert severity="error">That listing wasn't found.{error ? ` ${error}` : ''}</Alert>}
        {editState === 'denied' && (
          <Alert severity="warning">Only listings created in the app can be edited here, by the person who created them or a manager.</Alert>
        )}
      </MpShell>
    );
  }

  const toggle = (k: 'isLifted' | 'isStreetLegal' | 'hasSoundSystem' | 'hasExtendedTop' | 'hasHitch', label: string) => (
    <FormControlLabel control={<Switch checked={form[k]} onChange={(e) => set(k, e.target.checked)} />} label={label} />
  );

  const photosStep = (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
        <Button size="large" variant="contained" startIcon={<PhotoCamera />} onClick={() => cameraRef.current?.click()} sx={{ py: 2 }}>
          Take photos
        </Button>
        <Button size="large" variant="outlined" startIcon={<AddPhotoAlternate />} onClick={() => pickRef.current?.click()} sx={{ py: 2 }}>
          Upload
        </Button>
        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={pickRef} hidden type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </Box>
      {photos.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Snap the front, side, back, seats and dash. The first photo is the cover. Photos are resized before upload.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 1, mb: 2 }}>
          {photos.map((p, i) => (
            <Box key={p.key} sx={{ position: 'relative', aspectRatio: '1', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.200' }}>
              <Box component="img" src={p.preview} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: p.status === 'uploading' ? 0.55 : 1 }} />
              {p.status === 'uploading' && <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />}
              {p.status === 'error' && (
                <Button size="small" color="error" variant="contained" onClick={() => retry(p)} title={p.error} sx={{ position: 'absolute', left: 4, bottom: 4, minWidth: 0, px: 1, fontSize: 11 }}>
                  Retry
                </Button>
              )}
              <IconButton size="small" onClick={() => removePhoto(p.key)} aria-label="Remove photo" sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}>
                <Close fontSize="small" />
              </IconButton>
              <Tooltip title={i === 0 ? 'Cover photo' : 'Make cover'}>
                <IconButton size="small" onClick={() => makeCover(p.key)} sx={{ position: 'absolute', top: 2, left: 2, bgcolor: 'rgba(0,0,0,0.55)', color: i === 0 ? '#ffd54f' : '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}>
                  {i === 0 ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Photo studio">
                <IconButton size="small" onClick={() => setStudio(i)} disabled={p.status === 'uploading'} sx={{ position: 'absolute', bottom: 2, right: 2, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}>
                  <PhotoFilter fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}
      {failed > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{failed} photo(s) failed to upload. Tap Retry or remove them.</Alert>}

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Describe it (optional)</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            placeholder="e.g. 2022 Evolution Classic 4 Plus, lithium, lifted, blue with white seats, used, great shape"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <VoiceButton value={note} onChange={setNote} onError={(m) => setAiMsg({ severity: 'warning', text: m })} />
        </Box>
        {!aiUnavailable && (
          <Button
            sx={{ mt: 1.5 }}
            fullWidth
            size="large"
            variant="contained"
            color="secondary"
            startIcon={aiBusy ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome />}
            disabled={aiBusy || (!readyUrls.length && !note.trim())}
            onClick={runAi}
          >
            {aiBusy ? 'Reading photos…' : 'Fill details with AI'}
          </Button>
        )}
        {uploading && !aiBusy && <Typography variant="caption" color="text.secondary">Uploading photos… AI uses the ones that are done.</Typography>}
      </Paper>
      {aiMsg && <Alert severity={aiMsg.severity} sx={{ mt: 1.5 }}>{aiMsg.text}</Alert>}
    </Box>
  );

  const detailsStep = (
    <Box>
      {aiMsg && aiMsg.severity === 'success' && <Alert severity="success" sx={{ mb: 2 }}>{aiMsg.text}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        <TextField label="Make" value={form.make} onChange={(e) => set('make', e.target.value)} required />
        <TextField label="Model" value={form.model} onChange={(e) => set('model', e.target.value)} required />
        <TextField label="Year" value={form.year} inputProps={{ inputMode: 'numeric', maxLength: 4 }} onChange={(e) => set('year', e.target.value.replace(/[^0-9]/g, ''))} />
        <TextField label="Color" value={form.color} onChange={(e) => set('color', e.target.value)} />
        <TextField label="Seat color" value={form.seatColor} onChange={(e) => set('seatColor', e.target.value)} />
        <TextField label="Passengers" value={form.passengers} inputProps={{ inputMode: 'numeric' }} onChange={(e) => set('passengers', e.target.value.replace(/[^0-9]/g, ''))} />
        <TextField
          label="Price"
          value={form.price}
          required
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }} color="text.secondary">$</Typography> }}
          onChange={(e) => set('price', e.target.value.replace(/[^0-9.,]/g, ''))}
        />
        <TextField select label="Location" value={form.locationId} required onChange={(e) => set('locationId', e.target.value)}>
          {DEALERSHIPS.map((d) => (
            <MenuItem key={d.id} value={d.id}>{d.id} · {d.cityState || d.name}</MenuItem>
          ))}
        </TextField>
        <TextField select label="Category" value={form.category} onChange={(e) => set('category', e.target.value as ListingCategory)}>
          {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
      </Box>
      {suggestion && (
        <Alert
          severity="info"
          sx={{ mt: 1.5 }}
          action={suggestion.price ? <Button color="inherit" size="small" onClick={() => set('price', String(suggestion.price))}>Use</Button> : undefined}
        >
          {suggestion.price ? <b>Suggested {formatPrice(suggestion.price)} · </b> : null}
          {suggestion.reason}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mt: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={form.isUsed ? 'used' : 'new'} onChange={(_, v) => v && set('isUsed', v === 'used')}>
          <ToggleButton value="new">New</ToggleButton>
          <ToggleButton value="used">Used</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup exclusive size="small" value={form.isElectric ? 'electric' : 'gas'} onChange={(_, v) => v && set('isElectric', v === 'electric')}>
          <ToggleButton value="electric">Electric</ToggleButton>
          <ToggleButton value="gas">Gas</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {form.isElectric && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1.5 }}>
          <TextField select label="Battery type" value={form.batteryType} onChange={(e) => set('batteryType', e.target.value)}>
            {['', 'Lithium', 'Lead Acid', 'AGM', ...(form.batteryType && !['Lithium', 'Lead Acid', 'AGM'].includes(form.batteryType) ? [form.batteryType] : [])].map((b) => (
              <MenuItem key={b || 'none'} value={b}>{b || 'Unknown'}</MenuItem>
            ))}
          </TextField>
          <TextField label="Voltage" placeholder="48" value={form.packVoltage} onChange={(e) => set('packVoltage', e.target.value)} />
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, mt: 1 }}>
        {toggle('isLifted', 'Lifted')}
        {toggle('isStreetLegal', 'Street legal')}
        {toggle('hasSoundSystem', 'Sound system')}
        {toggle('hasExtendedTop', 'Extended roof')}
        {toggle('hasHitch', 'Hitch')}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mt: 1 }}>
        <TextField label="Tire / rim size" placeholder='14"' value={form.tireRimSize} onChange={(e) => set('tireRimSize', e.target.value)} />
        <TextField label="Tire type" placeholder="All-terrain" value={form.tireType} onChange={(e) => set('tireType', e.target.value)} />
        <TextField label="Serial / VIN (optional)" value={form.serial} onChange={(e) => set('serial', e.target.value)} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Description</Typography>
        {templates.length > 0 && (
          <TextField
            select
            size="small"
            label="Apply template"
            value=""
            sx={{ minWidth: 180 }}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) set('description', fillTemplate(t.body, { cart, name: profile?.name }));
            }}
          >
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}
          </TextField>
        )}
        <VoiceButton value={form.description} onChange={(v) => set('description', v)} onError={(m) => setError(m)} />
      </Box>
      <TextField fullWidth multiline minRows={4} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What makes this cart great? Only facts you know." />
    </Box>
  );

  const facts = [
    form.isUsed ? 'Used' : 'New',
    form.isElectric ? [form.packVoltage && `${form.packVoltage.replace(/v$/i, '')}V`, form.batteryType, 'electric'].filter(Boolean).join(' ') : 'Gas',
    form.passengers && `${form.passengers} passenger`,
    form.isLifted && 'Lifted',
    form.isStreetLegal && 'Street legal',
    form.hasSoundSystem && 'Sound system',
    form.hasExtendedTop && 'Extended roof',
    form.hasHitch && 'Hitch',
    form.color && `${form.color}${form.seatColor ? ` / ${form.seatColor} seats` : ''}`,
    form.tireRimSize && `${form.tireRimSize} ${form.tireType}`.trim(),
    form.category !== 'golf cart' && form.category,
  ].filter(Boolean) as string[];

  const reviewStep = (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {readyUrls[0] ? (
        <Box component="img" src={readyUrls[0]} alt="" sx={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }} />
      ) : (
        <Box sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.100' }}><Typography color="text.secondary">No photos yet</Typography></Box>
      )}
      <Box sx={{ p: 2 }}>
        <Typography variant="h6">{cartTitle(cart)}</Typography>
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>{price ? formatPrice(price) : 'No price'}</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
          {[form.year, form.make, form.model].filter(Boolean).join(' ')} · {form.locationId ? `${form.locationId} ${locationName(form.locationId)}` : 'No location'}
          {form.serial ? ` · ${form.serial}` : ''}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          {facts.map((f) => <Chip key={f} size="small" label={f} />)}
          <Chip size="small" variant="outlined" label={`${readyUrls.length} photo${readyUrls.length === 1 ? '' : 's'}`} />
        </Box>
        <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body2">{form.description || <i>No description.</i>}</Typography>
      </Box>
      {problems.length > 0 && <Alert severity="warning" sx={{ m: 2, mt: 0 }}>{problems.join(' ')}</Alert>}
    </Paper>
  );

  return (
    <MpShell>
      <Box sx={{ maxWidth: 820, mx: 'auto', pb: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>{editId ? 'Edit listing' : 'New listing'}</Typography>
          {!editId && <Chip size="small" color="primary" variant="outlined" label="Snap to list" />}
        </Box>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 1 }}>
          {STEPS.map((s, i) => (
            <Step key={s} completed={step > i}>
              <StepLabel onClick={() => setStep(i)} sx={{ cursor: 'pointer' }}>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <LinearProgress variant="determinate" value={((step + 1) / STEPS.length) * 100} sx={{ mb: 2, height: 6, borderRadius: 3 }} />
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {step === 0 && photosStep}
        {step === 1 && detailsStep}
        {step === 2 && reviewStep}
      </Box>

      {/* Sticky action bar: easy to reach with a thumb. */}
      <Paper
        elevation={8}
        sx={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: (t) => t.zIndex.appBar,
          px: 2, py: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))', display: 'flex', gap: 1, justifyContent: 'center',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, width: '100%', maxWidth: 820 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {step < 2 ? (
            <Button variant="contained" endIcon={<ArrowForward />} onClick={() => setStep(step + 1)} sx={{ minWidth: 140 }}>
              {step === 0 && photos.length === 0 ? 'Skip photos' : 'Next'}
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save />}
              disabled={saving || uploading || problems.length > 0}
              onClick={save}
              sx={{ minWidth: 160 }}
            >
              {uploading ? 'Uploading…' : editId ? 'Save changes' : 'Save listing'}
            </Button>
          )}
        </Box>
      </Paper>

      {studio !== null && (
        <PhotoStudio
          open
          onClose={() => setStudio(null)}
          sources={studioSources}
          initialIndex={studio}
          fileBase={cartTitle(cart)}
          locationId={form.locationId}
          onApply={applyStudio}
          applyLabel="Use in listing"
        />
      )}
    </MpShell>
  );
}
