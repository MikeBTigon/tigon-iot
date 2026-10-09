import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonGroup, Card, CardActionArea, CardContent, Chip, Menu, MenuItem, Snackbar, Typography } from '@mui/material';
import { ArrowDropDown, Bolt, CheckCircle, Download, Warning } from '@mui/icons-material';
import { cartName, cartTitle } from '../cartLogic';
import { formatPrice, hasPhotoIssue, isPostedBy, postedAccountCount, workingPhotos } from '../cartUtils';
import { locationName } from '../constants';
import { useMp } from '../MpDataContext';
import { saveAllPhotos } from '../photos';
import { openFacebookAssisted, quickFbList } from '../quickList';
import { useAutoMarkPosted } from '../useAutoMarkPosted';
import { notify } from '../../ui/notify';
import { logEvent } from '../../native/deviceSession';
import type { MpCart } from '../types';
import CartPhoto from './CartPhoto';

const CartCard: React.FC<{ cart: MpCart }> = ({ cart }) => {
  const navigate = useNavigate();
  const { brokenPhotos, userKeys } = useMp();
  const photos = workingPhotos(cart, brokenPhotos);
  const posted = isPostedBy(cart, userKeys);
  const acctCount = postedAccountCount(cart);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [note, setNote] = useState('');
  const autoMark = useAutoMarkPosted();
  const uid = userKeys[0] || '';
  const run = async (fn: () => Promise<string>, mark = false) => {
    setMenu(null);
    try {
      const msg = await fn();
      // Quick FB List: mark it posted on the account being used (Undo if it wasn't published). Shown page-wide,
      // because a marked card can drop off Suggested to post right away.
      const marked = mark ? await autoMark(cart).catch(() => null) : null;
      if (marked?.note) {
        notify(`${msg} ${marked.note}`, 'success', {
          label: 'Undo',
          run: () => { void marked.undo().then(() => notify('Undone — not marked as posted.', 'info')); },
        });
      } else setNote(msg);
      logEvent(uid, 'listing_prepared', { cartId: cart.docId });
      logEvent(uid, 'marketplace_opened', { cartId: cart.docId });
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardActionArea onClick={() => navigate(`/mp/cart/${encodeURIComponent(cart.docId)}`)} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <Box sx={{ position: 'relative' }}>
          <CartPhoto file={photos[0]} alt={cartTitle(cart)} />
          <Chip
            size="small"
            label={`${photos.length} photo${photos.length === 1 ? '' : 's'}`}
            sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.6)', color: 'white' }}
          />
        </Box>
        <CardContent sx={{ flexGrow: 1, p: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.25 }}>{cartTitle(cart)}</Typography>
          {cart.year && <Typography variant="caption" color="text.secondary">{cartName(cart)}</Typography>}
          <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>{formatPrice(cart.price)}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {cart.locationId} · {locationName(cart.locationId)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
            <Chip size="small" label={cart.isUsed ? 'Used' : 'New'} color={cart.isUsed ? 'secondary' : 'default'} />
            {posted && <Chip size="small" color="success" icon={<CheckCircle />} label="Posted" />}
            {acctCount > 0 && <Chip size="small" variant="outlined" label={`${acctCount} acct${acctCount === 1 ? '' : 's'}`} />}
            {hasPhotoIssue(cart, brokenPhotos) && <Chip size="small" color="warning" icon={<Warning />} label="photo issue" />}
            {cart.flaggedDelete && <Chip size="small" color="error" label="delete flag" />}
          </Box>
        </CardContent>
      </CardActionArea>
      <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <ButtonGroup fullWidth size="small" variant="contained">
          <Button startIcon={<Bolt />} onClick={() => run(() => quickFbList(cart, photos, uid), true)}>Quick FB List</Button>
          <Button sx={{ width: 40, flex: '0 0 40px' }} aria-label="More Facebook options" onClick={(e) => setMenu(e.currentTarget)}><ArrowDropDown /></Button>
        </ButtonGroup>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => run(() => openFacebookAssisted(cart, uid))}>Open the Facebook app instead (copy text)</MenuItem>
          <MenuItem onClick={() => { setMenu(null); navigate(`/mp/prepare/${encodeURIComponent(cart.docId)}`); }}>Prepare listing (choose wording)</MenuItem>
        </Menu>
        {photos.length > 0 && (
          <Button size="small" fullWidth variant="outlined" startIcon={<Download />} onClick={() => saveAllPhotos(cart, photos)}>
            Save all photos
          </Button>
        )}
      </Box>
      <Snackbar open={!!note} autoHideDuration={6000} onClose={() => setNote('')} message={note} />
    </Card>
  );
};

export default CartCard;
