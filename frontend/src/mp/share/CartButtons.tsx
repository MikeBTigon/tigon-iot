import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CircularProgress, Snackbar } from '@mui/material';
import { IosShare, Share } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import { generateVariations } from '../cartLogic';
import { workingPhotos } from '../cartUtils';
import { logEvent } from '../../native/deviceSession';
import type { MpCart } from '../types';
import { buildCaption, getOrCreateLink } from './links';
import { shareTo } from './shareActions';

/** Cart-page buttons for the Share area: open the Share Kit, or quick-share with the default caption. */
export default function ShareCartButtons({ cart }: { cart: MpCart }) {
  const navigate = useNavigate();
  const { profile, brokenPhotos } = useMp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const quickShare = async () => {
    setBusy(true);
    try {
      const link = await getOrCreateLink({ cart, platform: 'other', campaign: 'quick_share' });
      const listing = generateVariations(cart, profile?.uid || '')[0];
      const caption = buildCaption(listing, cart, link, 'other');
      const res = await shareTo({
        platform: 'other', cart, title: caption.title, text: caption.text, link,
        photos: workingPhotos(cart, brokenPhotos).slice(0, 4),
      });
      setMsg(res.message);
      setRetry(() => res.retry || null);
      logEvent(profile?.uid, 'share', { cartId: cart.docId, message: 'quick' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg((e as Error).message || 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" color="secondary" startIcon={<Share />} onClick={() => navigate(`/mp/share/${cart.docId}`)}>
        Share Kit
      </Button>
      <Button variant="outlined" startIcon={busy ? <CircularProgress size={16} /> : <IosShare />} disabled={busy} onClick={quickShare}>
        Quick share
      </Button>
      <Snackbar
        open={!!msg}
        autoHideDuration={retry ? 12000 : 4000}
        onClose={() => setMsg('')}
        message={msg}
        action={retry ? <Button color="inherit" size="small" onClick={() => { retry(); setMsg(''); setRetry(null); }}>Share now</Button> : undefined}
      />
    </>
  );
}
