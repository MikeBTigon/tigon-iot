// Track 4 (inventory) — cart page panel: days on lot, aged flag + suggested price, price drops, walk-around videos,
// and (for a sold cart) the Facebook listings to clean up.
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { DeleteOutline, TrendingDown, Videocam } from '@mui/icons-material';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../../../config/firebase';
import { notify } from '../../../ui/notify';
import { COLLECTIONS } from '../../constants';
import { formatPrice } from '../../cartUtils';
import { isManager, useNow } from '../../crm/crmData';
import { useMp } from '../../MpDataContext';
import type { MpCart } from '../../types';
import { useSalesSettings } from '../salesData';
import { agedLevel, daysOnLot, priceDrops, suggestedPrice } from './inventoryUtils';

const MAX_BYTES = 200 * 1024 * 1024;
const LONG_SECONDS = 60;

const shortDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Video length in seconds (0 if the browser can't tell). */
function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    const done = (n: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(n) ? n : 0);
    };
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 5000);
    v.src = url;
  });
}

const CartInventoryPanel: React.FC<{ cart: MpCart }> = ({ cart }) => {
  const { profile, accounts, userName, refreshCart } = useMp();
  const { settings } = useSalesSettings();
  const now = useNow();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const manager = isManager(profile);

  const days = daysOnLot(cart, now);
  const level = cart.stockedAt ? agedLevel(days, settings.aged) : null;
  const suggested = level ? suggestedPrice(cart.price, settings.aged.suggestedCutPct) : 0;
  const drops = useMemo(() => priceDrops(cart), [cart]);
  const videos = cart.videos || [];
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || 'a Facebook account';

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      notify('That video is over 200 MB. Record a shorter one (about 1 minute is perfect).', 'error');
      return;
    }
    const secs = await videoSeconds(file);
    if (secs > LONG_SECONDS) notify(`That video is ${Math.round(secs)} seconds. Shorter videos (under a minute) get watched more.`, 'info');
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = `mp_videos/${cart.docId}/${Date.now()}.${ext}`;
    setProgress(0);
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type || 'video/mp4' });
    task.on(
      'state_changed',
      (snap) => setProgress(snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
      (err) => {
        console.error(err);
        setProgress(null);
        notify('Upload failed. Check your connection and try again.', 'error');
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await updateDoc(doc(db, COLLECTIONS.carts, cart.docId), { videos: arrayUnion(url), videoUpdatedAt: Date.now() });
          await refreshCart(cart.docId);
          notify('Video added to this cart.', 'success');
        } catch (e) {
          console.error(e);
          notify('The video uploaded but could not be saved to the cart.', 'error');
        } finally {
          setProgress(null);
        }
      },
    );
  };

  const remove = async (url: string) => {
    if (!window.confirm('Delete this video?')) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.carts, cart.docId), { videos: arrayRemove(url), videoUpdatedAt: Date.now() });
      await deleteObject(ref(storage, url)).catch(() => undefined);
      await refreshCart(cart.docId);
      notify('Video deleted.', 'success');
    } catch (e) {
      console.error(e);
      notify('Could not delete the video.', 'error');
    }
  };

  const cleanup = Object.entries(cart.postedAccounts || {});

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Inventory</Typography>

      {cart.soldLocally && cleanup.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 600 }}>Listings to clean up</Typography>
          This cart sold. Mark it sold or delete it on:
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {cleanup.map(([id, e]) => <li key={id}>{accountName(id)} (posted by {userName(e.by)})</li>)}
          </Box>
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography>{cart.stockedAt ? `On the lot ${days} day${days === 1 ? '' : 's'}` : 'Days on the lot: not known yet'}</Typography>
        {level === 'urgent' && <Chip size="small" color="error" label="Urgent" />}
        {level === 'aged' && <Chip size="small" color="warning" label="Aged" />}
      </Stack>
      {suggested > 0 && suggested < cart.price && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Suggested price to move it: <b>{formatPrice(suggested)}</b> ({settings.aged.suggestedCutPct}% off {formatPrice(cart.price)})
        </Typography>
      )}

      {drops.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="subtitle2">Price drops</Typography>
          {drops.map((d) => (
            <Typography key={d.at} variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingDown fontSize="small" color="success" /> {formatPrice(d.from)} → {formatPrice(d.to)} on {shortDate(d.at)}
            </Typography>
          ))}
        </Box>
      )}

      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Walk-around videos</Typography>
        {videos.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No video yet. A 30–60 second walk-around helps buyers decide — it also shows on the public cart page.
          </Typography>
        )}
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', mb: 1 }}>
          {videos.map((url) => (
            <Box key={url} sx={{ position: 'relative' }}>
              <Box component="video" src={url} controls playsInline preload="metadata"
                sx={{ width: '100%', borderRadius: 1, bgcolor: 'black', display: 'block', maxHeight: 320 }} />
              {manager && (
                <Tooltip title="Delete video">
                  <IconButton size="small" onClick={() => remove(url)} aria-label="Delete video"
                    sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'white' } }}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ))}
        </Box>
        {progress !== null ? (
          <Box>
            <Typography variant="body2">Uploading… {progress}%</Typography>
            <LinearProgress variant="determinate" value={progress} />
          </Box>
        ) : (
          <Button variant="outlined" startIcon={<Videocam />} onClick={() => input.current?.click()}>
            Record walk-around video
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            upload(f);
          }}
        />
      </Box>
    </Paper>
  );
};

export default CartInventoryPanel;
