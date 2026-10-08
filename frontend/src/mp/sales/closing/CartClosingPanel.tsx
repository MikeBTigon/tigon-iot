// Track 3 — on the cart page: send a quote for this cart, or text a test-drive booking link for it.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Paper, Typography } from '@mui/material';
import { Event, RequestQuote } from '@mui/icons-material';
import type { MpCart } from '../../types';
import { brandFromMake } from '../../finance/financeCalc';
import { cartTitle as titleOfCart } from '../../cartLogic';
import { bookUrl } from '../salesData';
import { TEXTS } from './closingUtils';
import TextLinkDialog from './TextLinkDialog';

const CartClosingPanel: React.FC<{ cart: MpCart }> = ({ cart }) => {
  const navigate = useNavigate();
  const [booking, setBooking] = useState(false);
  const title = titleOfCart(cart);
  const store = cart.locationId && cart.locationId !== 'Other' ? cart.locationId : '';
  const base = bookUrl(store);
  const link = `${base}${base.includes('?') ? '&' : '?'}cart=${encodeURIComponent(cart.docId)}`;

  const quote = () => navigate(`/mp/finance?${new URLSearchParams({
    cartId: cart.docId, price: String(cart.price || ''), brand: brandFromMake(cart.make, cart.isUsed), condition: cart.isUsed ? 'used' : 'new',
    title, send: '1',
  }).toString()}`);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Close the deal</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<RequestQuote />} onClick={quote} disabled={!cart.price}>Send a quote for this cart</Button>
        <Button variant="outlined" startIcon={<Event />} onClick={() => setBooking(true)}>Text a test-drive booking link</Button>
      </Box>
      <TextLinkDialog open={booking} onClose={() => setBooking(false)} title="Text a test-drive link" template={TEXTS.booking.replace('for a test drive', 'to test drive the {cart}')}
        link={link} kind="appointment" storeId={store} cartTitle={title} />
    </Paper>
  );
};

export default CartClosingPanel;
