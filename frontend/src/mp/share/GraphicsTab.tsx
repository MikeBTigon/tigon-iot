import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { AutoAwesome, Download, IosShare } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import { cartName, locationCity, photoDownloadUrl, photoUrl } from '../cartLogic';
import { copyText } from '../../native/actions';
import { logEvent } from '../../native/deviceSession';
import { isNativeApp } from '../../native/platform';
import type { Listing, MpCart } from '../types';
import type { SharePlatform } from '../growthTypes';
import {
  canvasBlob, graphicSubtitle, GRAPHIC_SIZES, GRAPHIC_TEMPLATES, loadImage, renderGraphic, type GraphicSize, type GraphicTemplate,
} from './graphics';
import { buildCaption, getOrCreateLink, PLATFORM_LABEL, storePhone } from './links';
import { qrCanvas } from './qr';
import { cartFileBase, nativeShare, saveBlob } from './shareActions';
import { useMpSettings } from './useShareData';

const POST_TO: SharePlatform[] = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'x', 'other'];

/** Share Kit → Graphics: branded square posts and stories with a QR code. */
const GraphicsTab: React.FC<{ cart: MpCart; listing: Listing; photos: string[] }> = ({ cart, listing, photos }) => {
  const { profile } = useMp();
  const settings = useMpSettings();
  const [size, setSize] = useState<GraphicSize>('post');
  const [template, setTemplate] = useState<GraphicTemplate>('bold');
  const [photoIdx, setPhotoIdx] = useState(0);
  const [platform, setPlatform] = useState<SharePlatform>('instagram');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; blob: Blob; name: string; link: string } | null>(null);
  const photo = photos[Math.min(photoIdx, photos.length - 1)] || '';

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const link = await getOrCreateLink({ cart, platform, campaign: 'graphic' });
      const [img, logo, qr] = await Promise.all([
        loadImage(photo ? photoDownloadUrl(photo) : ''),
        loadImage(settings.logoUrl || ''),
        qrCanvas(link, 480).catch(() => null),
      ]);
      const canvas = renderGraphic({
        size, template, photo: img, logo, qr,
        title: cartName(cart),
        subtitle: graphicSubtitle(cart),
        price: cart.price > 0 ? `$${cart.price.toLocaleString('en-US')}` : '',
        place: locationCity(cart.locationId) ? `TIGON ${locationCity(cart.locationId)}` : 'TIGON Golf Carts',
        phone: storePhone(cart),
      });
      const blob = await canvasBlob(canvas);
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(blob), blob, name: `${cartFileBase(cart)}_${size}_${template}.png`, link });
      if (!img && photo) setError('The photo could not be loaded, so a brand background was used instead.');
    } catch (e) {
      setError((e as Error).message || 'Could not make the image.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    await saveBlob(result.blob, result.name, cartName(cart)).catch((e) => setError(e.message));
  };

  const shareIt = async () => {
    if (!result) return;
    const caption = buildCaption(listing, cart, result.link, platform);
    await copyText(caption.text).catch(() => undefined);
    try {
      if (isNativeApp()) {
        await nativeShare({ title: caption.title, text: caption.text, files: [{ name: result.name, blob: result.blob }] });
      } else {
        const file = new File([result.blob], result.name, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: caption.text, title: caption.title });
        else await saveBlob(result.blob, result.name);
      }
      logEvent(profile?.uid, 'share', { cartId: cart.docId, message: `${platform}:graphic` });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={size} onChange={(_, v) => v && setSize(v)}>
          {(Object.keys(GRAPHIC_SIZES) as GraphicSize[]).map((s) => <ToggleButton key={s} value={s}>{GRAPHIC_SIZES[s].label}</ToggleButton>)}
        </ToggleButtonGroup>
        <ToggleButtonGroup exclusive size="small" value={template} onChange={(_, v) => v && setTemplate(v)}>
          {GRAPHIC_TEMPLATES.map((t) => <ToggleButton key={t.id} value={t.id}>{t.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Posting to</InputLabel>
          <Select label="Posting to" value={platform} onChange={(e) => setPlatform(e.target.value as SharePlatform)}>
            {POST_TO.map((p) => <MenuItem key={p} value={p}>{PLATFORM_LABEL[p]}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {photos.length > 1 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>Main photo</Typography>
          <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
            {photos.map((p, i) => (
              <Box
                key={p}
                component="img"
                src={photoUrl(p)}
                onClick={() => setPhotoIdx(i)}
                sx={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 1, cursor: 'pointer', flexShrink: 0, outline: i === photoIdx ? '3px solid #af1f31' : '1px solid #ddd' }}
              />
            ))}
          </Box>
        </Box>
      )}
      <Button variant="contained" startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome />} disabled={busy} onClick={make}>
        {result ? 'Remake image' : 'Make image'}
      </Button>
      {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
      {result && (
        <Box sx={{ mt: 2 }}>
          <Box component="img" src={result.url} alt="Graphic preview" sx={{ width: '100%', maxWidth: size === 'story' ? 300 : 420, display: 'block', borderRadius: 1, boxShadow: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<IosShare />} onClick={shareIt}>Share image</Button>
            <Button variant="outlined" startIcon={<Download />} onClick={save}>Save</Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            The QR code opens a tracked link ({PLATFORM_LABEL[platform]}). Sharing also copies the caption.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default GraphicsTab;
