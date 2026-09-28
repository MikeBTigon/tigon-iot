import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Box, Button } from '@mui/material';
import { Edit, PhotoFilter } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import { cartName, photoUrl } from '../cartLogic';
import { writeAudit } from '../audit';
import type { MpCart } from '../types';
import PhotoStudio from './PhotoStudio';
import { uploadMedia } from './media';
import { parsePayload } from './listingModel';

/** Cart-page buttons for the Create area: Photo studio, and Edit listing for app-created carts. */
export default function CreateCartButtons({ cart }: { cart: MpCart }) {
  const navigate = useNavigate();
  const { profile, refreshCart } = useMp();
  const [open, setOpen] = useState(false);
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const canEdit = cart.source === 'manual' && !!profile && (cart.createdBy === profile.uid || isManager);
  const sources = useMemo(() => cart.photos.map(photoUrl), [cart.photos]);

  /** Uploads the edited photo and swaps it into the listing's payload (manual carts only). */
  const replacePhoto = async (blob: Blob, index: number) => {
    if (!profile) throw new Error('Sign in first.');
    const url = await uploadMedia(profile.uid, blob, `${cartName(cart)}-studio`);
    const ref = doc(db, COLLECTIONS.carts, cart.docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('This listing no longer exists.');
    const raw = parsePayload(snap.get('payload'));
    const images = (Array.isArray(raw.imageUrls) ? raw.imageUrls : []).map(String);
    if (index < images.length) images[index] = url;
    else images.push(url);
    await updateDoc(ref, {
      payload: JSON.stringify({ ...raw, imageUrls: images }),
      photoUrls: images,
      savedAt: Date.now(),
    });
    await writeAudit(profile, 'listing.photo_replaced', cart.docId, `photo ${index + 1}`);
    await refreshCart(cart.docId);
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <Button variant="outlined" startIcon={<PhotoFilter />} onClick={() => setOpen(true)}>
        Photo studio
      </Button>
      {canEdit && (
        <Button variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/mp/new?edit=${encodeURIComponent(cart.docId)}`)}>
          Edit listing
        </Button>
      )}
      {open && (
        <PhotoStudio
          open={open}
          onClose={() => setOpen(false)}
          sources={sources}
          fileBase={cartName(cart)}
          locationId={cart.locationId}
          onApply={canEdit ? replacePhoto : undefined}
          applyLabel="Replace photo in listing"
        />
      )}
    </Box>
  );
}
