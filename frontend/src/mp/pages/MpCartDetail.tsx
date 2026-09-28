import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { ArrowBack, CheckCircle, Description, Download, RadioButtonUnchecked, Refresh } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CartPhoto from '../components/CartPhoto';
import PhotoLightbox from '../components/PhotoLightbox';
import ListingVariations from '../components/ListingVariations';
import PostedOnTracker from '../components/PostedOnTracker';
import StoreInfo from '../components/StoreInfo';
import { useMp } from '../MpDataContext';
import { cartName, cartTitle } from '../cartLogic';
import { formatPrice, hasPhotoIssue, postedTs, timeAgo, workingPhotos } from '../cartUtils';
import { locationName } from '../constants';
import { savePhoto, saveAllPhotos } from '../photos';

const yes = (b: boolean) => (b ? 'Yes' : 'No');

const MpCartDetail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { carts, cartsLoading, brokenPhotos, userKeys, isAdmin, setPosted, refreshCart, userName } = useMp();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cart = carts.find((c) => c.docId === id);

  useEffect(() => {
    if (!cart && !cartsLoading) refreshCart(id).catch(() => undefined);
  }, [cart, cartsLoading, id, refreshCart]);

  if (!cart) {
    return (
      <MpShell>
        {cartsLoading ? <CircularProgress /> : <Alert severity="warning">Cart not found — it may have sold and been removed.</Alert>}
      </MpShell>
    );
  }

  const photos = workingPhotos(cart, brokenPhotos);
  const myTs = postedTs(cart, userKeys);
  const togglePosted = async () => {
    setBusy(true);
    setError('');
    try {
      await setPosted(cart, !myTs);
    } catch (e) {
      console.error(e);
      setError('Could not update posted status.');
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<[string, string]> = [
    ['Price', formatPrice(cart.price)],
    ['Condition', cart.isUsed ? 'Used' : 'New'],
    ['Location', `${cart.locationId} · ${locationName(cart.locationId)}`],
    ['Power', cart.isElectric ? `Electric${cart.packVoltage ? ` · ${cart.packVoltage}` : ''}` : `Gas${cart.engineMake ? ` · ${cart.engineMake}` : ''}`],
    ...(cart.isElectric ? [['Battery', [cart.batteryType, cart.batteryBrand, cart.batteryYear].filter(Boolean).join(' · ') || '—'] as [string, string]] : []),
    ['Passengers', cart.passengers ? String(cart.passengers) : '—'],
    ['Color / seats', [cart.color, cart.seatColor].filter(Boolean).join(' / ') || '—'],
    ['Wheels / tires', [cart.tireRimSize && `${cart.tireRimSize}"`, cart.tireType].filter(Boolean).join(' · ') || '—'],
    ['Drivetrain', cart.driveTrain || '—'],
    ['Lifted', yes(cart.isLifted)],
    ['Street legal', yes(cart.isStreetLegal)],
    ['Extended roof', yes(cart.hasExtendedTop)],
    ['Sound system', yes(cart.hasSoundSystem)],
    ['Hitch', yes(cart.hasHitch)],
    ['Cart warranty', cart.cartWarranty || '—'],
    ...(cart.isElectric ? [['Battery warranty', cart.batteryWarranty || '—'] as [string, string]] : []),
    ['Serial', cart.serial || '—'],
    ['VIN', cart.vin || '—'],
    ['DMS status', cart.status || '—'],
    ['Synced', timeAgo(cart.savedAt) || '—'],
  ];

  const postedUsers = Object.entries(cart.postedBy).sort((a, b) => b[1] - a[1]);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)}>Back</Button>
        <Button startIcon={<Refresh />} onClick={() => refreshCart(cart.docId)}>Refresh</Button>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">{cartTitle(cart)}</Typography>
          <Typography color="text.secondary">{cartName(cart)}</Typography>
          <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>{formatPrice(cart.price)}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Chip label={cart.isUsed ? 'Used' : 'New'} color="secondary" />
            <Chip label={`${cart.locationId} · ${locationName(cart.locationId)}`} variant="outlined" />
            {hasPhotoIssue(cart, brokenPhotos) && <Chip color="warning" label="⚠ photo issue" />}
            {cart.flaggedDelete && <Chip color="error" label="Flagged 'delete' in DMS" />}
            {cart.photoSource === 'default' && <Chip variant="outlined" label="Default new-cart images" />}
          </Box>
          {cart.windowSticker && (
            <Button size="small" startIcon={<Description />} href={cart.windowSticker} target="_blank" rel="noopener noreferrer" sx={{ mt: 1 }}>
              Window sticker
            </Button>
          )}
        </Box>
        {isAdmin && (
          <Button
            variant={myTs ? 'outlined' : 'contained'}
            color={myTs ? 'success' : 'primary'}
            startIcon={myTs ? <CheckCircle /> : <RadioButtonUnchecked />}
            onClick={togglePosted}
            disabled={busy}
          >
            {myTs ? `Posted by you ${timeAgo(myTs)} — undo` : 'Mark posted'}
          </Button>
        )}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" color="primary">Photos ({photos.length})</Typography>
          {photos.length > 0 && (
            <Button size="small" variant="contained" startIcon={<Download />} onClick={() => saveAllPhotos(cart, photos)}>Save all</Button>
          )}
        </Box>
        {photos.length === 0 ? (
          <Typography color="text.secondary">No working photos for this cart.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {photos.map((p, i) => (
              <Box key={p} sx={{ borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'grey.200' }}>
                <CartPhoto file={p} height={110} onClick={() => setLightbox(i)} />
                <Button size="small" fullWidth startIcon={<Download />} onClick={() => savePhoto(cart, p, i)}>Save</Button>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 3 }}>
        <ListingVariations cart={cart} userId={userKeys[0] || ''} />
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" color="primary" gutterBottom>Cart info</Typography>
          <Table size="small">
            <TableBody>
              {rows.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell sx={{ color: 'text.secondary', width: '40%' }}>{k}</TableCell>
                  <TableCell>{v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {postedUsers.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Marked posted by</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {postedUsers.map(([k, ts]) => <Chip key={k} size="small" label={`${userName(k)} · ${timeAgo(ts)}`} />)}
              </Box>
            </Box>
          )}
        </Paper>
      </Box>

      <PostedOnTracker cart={cart} />
      <Box sx={{ mt: 3 }}>
        <StoreInfo locationId={cart.locationId} />
      </Box>
      <PhotoLightbox cart={cart} photos={photos} index={lightbox} onChange={setLightbox} />
    </MpShell>
  );
};

export default MpCartDetail;
