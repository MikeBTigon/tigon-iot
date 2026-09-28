import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material';
import { CheckCircle, Download, Warning } from '@mui/icons-material';
import { cartName, cartTitle } from '../cartLogic';
import { formatPrice, hasPhotoIssue, isPostedBy, postedAccountCount, workingPhotos } from '../cartUtils';
import { locationName } from '../constants';
import { useMp } from '../MpDataContext';
import { saveAllPhotos } from '../photos';
import type { MpCart } from '../types';
import CartPhoto from './CartPhoto';

const CartCard: React.FC<{ cart: MpCart }> = ({ cart }) => {
  const navigate = useNavigate();
  const { brokenPhotos, userKeys } = useMp();
  const photos = workingPhotos(cart, brokenPhotos);
  const posted = isPostedBy(cart, userKeys);
  const acctCount = postedAccountCount(cart);

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
      {photos.length > 0 && (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <Button size="small" fullWidth variant="outlined" startIcon={<Download />} onClick={() => saveAllPhotos(cart, photos)}>
            Save all photos
          </Button>
        </Box>
      )}
    </Card>
  );
};

export default CartCard;
