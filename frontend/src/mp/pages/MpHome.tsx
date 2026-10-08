import React, { useMemo } from 'react';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import MpShell from '../components/MpShell';
import CartGrid from '../components/CartGrid';
import CartCard from '../components/CartCard';
import { useMp } from '../MpDataContext';
import { isPostedBy, photoRank, suggestedQueue } from '../cartUtils';
import { useMpSettings, useNow } from '../crm/crmData';
import { useSalesSettings } from '../sales/salesData';
import { agedLabel, agedLevel, daysOnLot, staleAccounts } from '../sales/inventory/inventoryUtils';
import type { MpCart } from '../types';

const MAX_FIRST = 12;

const MpHome: React.FC = () => {
  const { carts, userKeys, brokenPhotos, cartsLoading, profile } = useMp();
  const { settings } = useSalesSettings();
  const { relistAfterDays } = useMpSettings(!!profile);
  const now = useNow();
  const queue = useMemo(() => suggestedQueue(carts, userKeys, brokenPhotos), [carts, userKeys, brokenPhotos]);
  const postedCount = useMemo(() => carts.filter((c) => isPostedBy(c, userKeys)).length, [carts, userKeys]);

  // Top priority: aged carts I haven't posted (longest on the lot first), then my listings due for a repost.
  const { first, rest } = useMemo(() => {
    const uid = userKeys[0] || '';
    const chips = new Map<string, { cart: MpCart; aged?: { days: number; urgent: boolean }; repost?: boolean }>();
    carts
      .filter((c) => !c.flaggedDelete && c.stockedAt && !isPostedBy(c, userKeys) && photoRank(c, brokenPhotos) > 0)
      .map((c) => ({ c, days: daysOnLot(c, now) }))
      .filter((x) => agedLevel(x.days, settings.aged))
      .sort((a, b) => b.days - a.days)
      .slice(0, MAX_FIRST)
      .forEach((x) => chips.set(x.c.docId, { cart: x.c, aged: { days: x.days, urgent: agedLevel(x.days, settings.aged) === 'urgent' } }));
    if (uid) {
      carts
        .filter((c) => !c.flaggedDelete && staleAccounts(c, relistAfterDays, now, uid).length)
        .slice(0, MAX_FIRST)
        .forEach((c) => chips.set(c.docId, { ...(chips.get(c.docId) || { cart: c }), repost: true }));
    }
    return { first: [...chips.values()], rest: queue.filter((c) => !chips.has(c.docId)) };
  }, [carts, userKeys, brokenPhotos, now, settings.aged, relistAfterDays, queue]);

  return (
    <MpShell>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">Suggested to post</Typography>
        <Typography color="text.secondary">
          Carts you haven't posted yet — used first, photo-rich first, balanced across stores. You've posted {postedCount} of {carts.length}.
        </Typography>
      </Box>
      {cartsLoading && <Alert severity="info" sx={{ mb: 2 }}>Loading inventory… suggestions update as carts arrive.</Alert>}
      {first.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Do these first</Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {first.map(({ cart, aged, repost }) => (
              <Box key={cart.docId} sx={{ display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                  {aged && <Chip size="small" color={aged.urgent ? 'error' : 'warning'} label={agedLabel(aged.days)} />}
                  {repost && <Chip size="small" color="info" label="Repost" />}
                </Stack>
                <Box sx={{ flexGrow: 1 }}><CartCard cart={cart} /></Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      <CartGrid carts={rest} empty={cartsLoading ? 'Loading…' : 'Nothing left to post — nice work.'} />
    </MpShell>
  );
};

export default MpHome;
