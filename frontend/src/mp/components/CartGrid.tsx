import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { PAGE_SIZE } from '../constants';
import type { MpCart } from '../types';
import CartCard from './CartCard';

interface Props {
  carts: MpCart[];
  empty?: string;
}

/** Renders PAGE_SIZE cards at a time; a sentinel reveals more as you scroll. */
const CartGrid: React.FC<Props> = ({ carts, empty = 'No carts match.' }) => {
  const [shown, setShown] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);
  const more = shown < carts.length;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((s) => s + PAGE_SIZE);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, carts]);

  if (!carts.length) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{empty}</Typography>;
  }
  return (
    <>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {carts.slice(0, shown).map((c) => <CartCard key={c.docId} cart={c} />)}
      </Box>
      {more && (
        <Box ref={sentinel} sx={{ textAlign: 'center', py: 3 }}>
          <Button onClick={() => setShown((s) => s + PAGE_SIZE)}>Load more ({carts.length - shown} left)</Button>
        </Box>
      )}
    </>
  );
};

export default CartGrid;
