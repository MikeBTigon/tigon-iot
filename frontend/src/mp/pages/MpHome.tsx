import React, { useMemo } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import MpShell from '../components/MpShell';
import CartGrid from '../components/CartGrid';
import { useMp } from '../MpDataContext';
import { isPostedBy, suggestedQueue } from '../cartUtils';

const MpHome: React.FC = () => {
  const { carts, userKeys, brokenPhotos, cartsLoading } = useMp();
  const queue = useMemo(() => suggestedQueue(carts, userKeys, brokenPhotos), [carts, userKeys, brokenPhotos]);
  const postedCount = useMemo(() => carts.filter((c) => isPostedBy(c, userKeys)).length, [carts, userKeys]);

  return (
    <MpShell>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">Suggested to post</Typography>
        <Typography color="text.secondary">
          Carts you haven't posted yet — used first, photo-rich first, balanced across stores. You've posted {postedCount} of {carts.length}.
        </Typography>
      </Box>
      {cartsLoading && <Alert severity="info" sx={{ mb: 2 }}>Loading inventory… suggestions update as carts arrive.</Alert>}
      <CartGrid carts={queue} empty={cartsLoading ? 'Loading…' : 'Nothing left to post — nice work.'} />
    </MpShell>
  );
};

export default MpHome;
