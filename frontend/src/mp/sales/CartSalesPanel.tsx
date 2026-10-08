// "Sell more" release — what the sales features add to a cart page (MP Assistant → cart).
import React from 'react';
import { Stack } from '@mui/material';
import type { MpCart } from '../types';
import CartFbPanel from './speed/CartFbPanel';
import CartClosingPanel from './closing/CartClosingPanel';
import CartInventoryPanel from './inventory/CartInventoryPanel';

const CartSalesPanel: React.FC<{ cart: MpCart }> = ({ cart }) => (
  <Stack spacing={2} sx={{ mt: 2 }}>
    <CartInventoryPanel cart={cart} />
    <CartFbPanel cart={cart} />
    <CartClosingPanel cart={cart} />
  </Stack>
);

export default CartSalesPanel;
