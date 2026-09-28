import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Download, IosShare, Movie, Stop } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import { cartName, locationCity, photoDownloadUrl } from '../cartLogic';
import { copyText } from '../../native/actions';
import { logEvent } from '../../native/deviceSession';
import { isNativeApp } from '../../native/platform';
import type { Listing, MpCart } from '../types';
import { loadImage } from './graphics';
import { buildCaption, getOrCreateLink, storePhone } from './links';
import { cartFileBase, nativeShare, saveBlob } from './shareActions';
import { useMpSettings } from './useShareData';
import { pickVideoMime, recordSlideshow, slideshowSeconds, type RecordResult } from './video';

const MAX_PHOTOS = 8;

/** Share Kit → Video: records a vertical promo slideshow from the selected photos. */
const VideoTab: React.FC<{ cart: MpCart; listing: Listing; photos: string[] }> = ({ cart, listing, photos }) => {
  const { profile } = useMp();
  const settings = useMpSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [per, setPer] = useState(3);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [video, setVideo] = useState<(RecordResult & { url: string }) | null>(null);
  const [mime] = useState(() => pickVideoMime());
  const use = photos.slice(0, MAX_PHOTOS);

  // Stop recording and free the preview when leaving the tab.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);

  const make = async () => {
    setError('');
    setVideo(null);
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const [imgs, logo] = await Promise.all([
        Promise.all(use.map((p) => loadImage(photoDownloadUrl(p)))),
        loadImage(settings.logoUrl || ''),
      ]);
      const loaded = imgs.filter((i): i is HTMLImageElement => !!i);
      if (!loaded.length) throw new Error('The photos could not be loaded. Check your connection and try again.');
      const res = await recordSlideshow(canvasRef.current!, {
        photos: loaded,
        logo,
        title: cartName(cart),
        price: cart.price > 0 ? `$${cart.price.toLocaleString('en-US')}` : '',
        phone: storePhone(cart),
        place: locationCity(cart.locationId),
        secondsPerPhoto: per,
      }, setProgress, ctrl.signal);
      setVideo({ ...res, url: URL.createObjectURL(res.blob) });
      if (loaded.length < use.length) setError(`${use.length - loaded.length} photo(s) couldn't be loaded and were skipped.`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Could not make the video.');
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const fileName = video ? `${cartFileBase(cart)}_promo.${video.ext}` : '';

  const shareIt = async () => {
    if (!video) return;
    try {
      const link = await getOrCreateLink({ cart, platform: 'other', campaign: 'video' });
      const caption = buildCaption(listing, cart, link, 'instagram');
      await copyText(caption.text).catch(() => undefined);
      if (isNativeApp()) {
        await nativeShare({ title: caption.title, text: caption.text, files: [{ name: fileName, blob: video.blob }] });
      } else {
        const file = new File([video.blob], fileName, { type: video.mimeType });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: caption.text });
        else await saveBlob(video.blob, fileName);
      }
      logEvent(profile?.uid, 'share', { cartId: cart.docId, message: 'video' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  };

  if (!mime) {
    return (
      <Alert severity="info">
        This device or browser can't record video from the app (it needs canvas recording / MediaRecorder).
        Try Chrome on a computer or Android, or Safari on iPhone with iOS 14.3 or newer — or use Graphics instead.
      </Alert>
    );
  }

  const seconds = slideshowSeconds(use.length, per);
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Vertical 1080×1920 slideshow of {use.length} selected photo{use.length === 1 ? '' : 's'}
        {photos.length > MAX_PHOTOS ? ` (first ${MAX_PHOTOS})` : ''} with zoom, fades, price and phone — about {seconds} seconds.
        Keep this screen open while it records.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={per} onChange={(_, v) => v && setPer(v)} disabled={progress !== null}>
          <ToggleButton value={2}>Fast (2s)</ToggleButton>
          <ToggleButton value={3}>Normal (3s)</ToggleButton>
          <ToggleButton value={4}>Slow (4s)</ToggleButton>
        </ToggleButtonGroup>
        {progress === null ? (
          <Button variant="contained" startIcon={<Movie />} onClick={make} disabled={!use.length}>
            {video ? 'Make again' : 'Make video'}
          </Button>
        ) : (
          <Button variant="outlined" color="error" startIcon={<Stop />} onClick={() => abortRef.current?.abort()}>Cancel</Button>
        )}
      </Box>
      {!use.length && <Alert severity="info" sx={{ mb: 2 }}>Select at least one photo above.</Alert>}
      {progress !== null && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress variant="determinate" value={Math.round(progress * 100)} />
          <Typography variant="caption">Recording… {Math.round(progress * 100)}%</Typography>
        </Box>
      )}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Live canvas (recorded); hidden once a finished video is shown. */}
        <Box
          component="canvas"
          ref={canvasRef}
          sx={{ width: 220, aspectRatio: '9 / 16', bgcolor: '#0e4671', borderRadius: 1, display: progress !== null ? 'block' : 'none' }}
        />
        {video && progress === null && (
          <Box>
            <Box component="video" src={video.url} controls playsInline loop sx={{ width: 240, aspectRatio: '9 / 16', bgcolor: '#000', borderRadius: 1, display: 'block' }} />
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
              <Button variant="contained" startIcon={<IosShare />} onClick={shareIt}>Share video</Button>
              <Button variant="outlined" startIcon={<Download />} onClick={() => saveBlob(video.blob, fileName, cartName(cart)).catch((e) => setError(e.message))}>
                Save
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {video.ext.toUpperCase()} · {(video.blob.size / 1024 / 1024).toFixed(1)} MB
              {video.ext === 'webm' ? ' — some apps (Instagram on iPhone) need MP4; if upload fails, record on a phone.' : ''}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default VideoTab;
