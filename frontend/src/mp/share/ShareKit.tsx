import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, Paper, Radio, Snackbar, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import {
  ArrowBack, ContentCopy, Email, Facebook, Instagram, IosShare, MusicNote, Print, Sms, WhatsApp, X as XIcon,
} from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CartPhoto from '../components/CartPhoto';
import { useMp } from '../MpDataContext';
import { cartTitle, generateVariations } from '../cartLogic';
import { formatPrice, workingPhotos } from '../cartUtils';
import { copyText } from '../../native/actions';
import { logEvent } from '../../native/deviceSession';
import type { SharePlatform } from '../growthTypes';
import { buildCaption, getOrCreateLink } from './links';
import { shareTo, type ShareResult } from './shareActions';
import { useShareCart } from './useShareData';
import GraphicsTab from './GraphicsTab';
import VideoTab from './VideoTab';

const PLATFORMS: Array<{ id: SharePlatform; label: string; icon: React.ReactNode; color: string }> = [
  { id: 'facebook', label: 'Facebook', icon: <Facebook />, color: '#1877f2' },
  { id: 'instagram', label: 'Instagram', icon: <Instagram />, color: '#c13584' },
  { id: 'whatsapp', label: 'WhatsApp', icon: <WhatsApp />, color: '#25d366' },
  { id: 'tiktok', label: 'TikTok', icon: <MusicNote />, color: '#111' },
  { id: 'x', label: 'X', icon: <XIcon />, color: '#000' },
  { id: 'sms', label: 'Text', icon: <Sms />, color: '#0e4671' },
  { id: 'email', label: 'Email', icon: <Email />, color: '#555' },
  { id: 'other', label: 'More…', icon: <IosShare />, color: '#af1f31' },
];

/** Share Kit: pick text + photos, share to any platform with tracked links, make graphics/video/flyers. */
const ShareKit: React.FC = () => {
  const { cartId = '' } = useParams();
  const navigate = useNavigate();
  const { profile, brokenPhotos } = useMp();
  const { cart, loading } = useShareCart(cartId);
  const [tab, setTab] = useState<'share' | 'graphics' | 'video'>('share');
  const [variation, setVariation] = useState(0);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<SharePlatform | ''>('');
  const [toast, setToast] = useState<ShareResult | null>(null);
  const [lastCaption, setLastCaption] = useState('');
  const [error, setError] = useState('');

  const uid = profile?.uid || '';
  const variations = useMemo(() => (cart ? generateVariations(cart, uid) : []), [cart, uid]);
  const photos = useMemo(() => (cart ? workingPhotos(cart, brokenPhotos) : []), [cart, brokenPhotos]);
  const selected = picked ?? photos.slice(0, 4);

  if (!cart) {
    return (
      <MpShell>
        {loading ? <CircularProgress /> : <Alert severity="warning">Cart not found — it may have sold and been removed.</Alert>}
      </MpShell>
    );
  }
  const listing = variations[variation] || variations[0];

  const togglePhoto = (file: string) => {
    const set = new Set(selected);
    if (set.has(file)) set.delete(file);
    else set.add(file);
    setPicked(photos.filter((p) => set.has(p)));
  };

  const share = async (platform: SharePlatform) => {
    setBusy(platform);
    setError('');
    try {
      const link = await getOrCreateLink({ cart, platform, campaign: 'share_kit' });
      const caption = buildCaption(listing, cart, link, platform);
      setLastCaption(caption.text);
      const res = await shareTo({ platform, cart, title: caption.title, text: caption.text, link, photos: selected });
      setToast(res);
      logEvent(uid, 'share', { cartId: cart.docId, message: platform });
    } catch (e) {
      console.error(e);
      if ((e as Error).name !== 'AbortError' && !/cancel/i.test(String((e as Error).message))) {
        setError((e as Error).message || 'Could not share.');
      }
    } finally {
      setBusy('');
    }
  };

  const copyCaption = async () => {
    setBusy('other');
    setError('');
    try {
      const link = await getOrCreateLink({ cart, platform: 'other', campaign: 'share_kit' });
      const caption = buildCaption(listing, cart, link, 'other');
      await copyText(caption.text);
      setLastCaption(caption.text);
      setToast({ message: 'Caption + link copied.' });
      logEvent(uid, 'share', { cartId: cart.docId, message: 'copy' });
    } catch (e) {
      setError((e as Error).message || 'Could not create the link.');
    } finally {
      setBusy('');
    }
  };

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(`/mp/cart/${cart.docId}`)}>Cart</Button>
        <Typography variant="h5" sx={{ flexGrow: 1, minWidth: 200 }}>Share Kit · {cart.year} {cartTitle(cart)}</Typography>
        <Chip label={formatPrice(cart.price)} color="primary" />
        <Button variant="outlined" startIcon={<Print />} onClick={() => navigate(`/mp/flyer/${cart.docId}`)}>Print flyer</Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab value="share" label="Share" />
        <Tab value="graphics" label="Graphics" />
        <Tab value="video" label="Video" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Photos ({selected.length} selected)</Typography>
        {photos.length === 0 ? (
          <Typography color="text.secondary">This cart has no photos.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1 }}>
            {photos.map((p, i) => (
              <Box key={p} sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', outline: selected.includes(p) ? '3px solid #af1f31' : 'none' }}>
                <CartPhoto file={p} height={80} onClick={() => togglePhoto(p)} alt={`Photo ${i + 1}`} />
                <Checkbox
                  size="small"
                  checked={selected.includes(p)}
                  onChange={() => togglePhoto(p)}
                  sx={{ position: 'absolute', top: 0, right: 0, bgcolor: 'rgba(255,255,255,0.8)', p: 0.25, '&:hover': { bgcolor: '#fff' } }}
                />
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {tab === 'share' && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Listing text</Typography>
            {variations.map((v, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5, borderBottom: i < variations.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                <FormControlLabel
                  sx={{ m: 0, alignItems: 'flex-start', flex: 1 }}
                  control={<Radio size="small" checked={variation === i} onChange={() => setVariation(i)} sx={{ pt: 0.5 }} />}
                  label={
                    <Box>
                      <Typography fontWeight={600}>{v.title1} – {v.title2}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{
                        whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: variation === i ? 12 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {v.description}
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            ))}
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Share to</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Each button makes a tracked link for that app, so you can see which one brings buyers (Links & A/B).
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1 }}>
              {PLATFORMS.map((p) => (
                <Button
                  key={p.id}
                  variant="contained"
                  startIcon={busy === p.id ? <CircularProgress size={18} color="inherit" /> : p.icon}
                  disabled={!!busy}
                  onClick={() => share(p.id)}
                  sx={{ bgcolor: p.color, py: 1.25, '&:hover': { bgcolor: p.color, filter: 'brightness(1.1)' } }}
                >
                  {p.label}
                </Button>
              ))}
            </Box>
            <Button sx={{ mt: 1.5 }} variant="outlined" startIcon={<ContentCopy />} disabled={!!busy} onClick={copyCaption}>
              Copy caption + link
            </Button>
          </Paper>

          {lastCaption && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Last caption</Typography>
              <TextField value={lastCaption} multiline fullWidth minRows={3} maxRows={12} slotProps={{ input: { readOnly: true } }} />
            </Paper>
          )}
        </>
      )}

      {tab === 'graphics' && <GraphicsTab cart={cart} listing={listing} photos={selected.length ? selected : photos.slice(0, 1)} />}
      {tab === 'video' && <VideoTab cart={cart} listing={listing} photos={selected} />}

      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.retry ? 12000 : 5000}
        onClose={() => setToast(null)}
        message={toast?.message}
        action={toast?.retry ? (
          <Button color="inherit" size="small" onClick={() => { toast.retry?.(); setToast(null); }}>Share now</Button>
        ) : undefined}
      />
    </MpShell>
  );
};

export default ShareKit;
