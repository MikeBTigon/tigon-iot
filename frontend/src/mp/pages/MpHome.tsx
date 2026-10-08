import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, ListSubheader, MenuItem, Stack, TextField, Typography } from '@mui/material';
import MpShell from '../components/MpShell';
import CartCard from '../components/CartCard';
import { useMp } from '../MpDataContext';
import { groupAccounts, isPostedBy, roundRobin, suggestedByStore } from '../cartUtils';
import { usePostingAccountId } from '../useAutoMarkPosted';
import { locationName } from '../constants';
import { readLocal, writeLocal } from '../../ui/prefs';
import { useMpSettings, useNow } from '../crm/crmData';
import { useSalesSettings } from '../sales/salesData';
import { agedLabel, agedLevel, daysOnLot, staleAccounts } from '../sales/inventory/inventoryUtils';
import type { MpCart } from '../types';

const MAX_REPOST = 12;
const PAGE = 48;
const PICK_KEY = 'mp.suggestAccount';

const MpHome: React.FC = () => {
  const { carts, userKeys, brokenPhotos, cartsLoading, profile, accounts } = useMp();
  // Which Facebook account to suggest for: picked here, else this phone's / last-used account, else "me".
  const guess = usePostingAccountId();
  const [picked, setPicked] = useState(() => readLocal(PICK_KEY) || '');
  const accountId = [picked, guess].find((id) => id === 'me' || accounts.some((a) => a.id === id)) || 'me';
  const account = accounts.find((a) => a.id === accountId);
  const pick = (id: string) => {
    setPicked(id);
    writeLocal(PICK_KEY, id);
  };
  const grouped = useMemo(() => groupAccounts(accounts), [accounts]);
  const { settings } = useSalesSettings();
  const { relistAfterDays } = useMpSettings(!!profile);
  const now = useNow();
  const notPostedHere = (c: MpCart) => (account ? !c.postedAccounts[account.id] : !isPostedBy(c, userKeys));
  // Store by store (T1, T2, …), each blended by time on the lot and low price.
  const stores = useMemo(
    () => suggestedByStore(carts, brokenPhotos, notPostedHere, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notPostedHere depends on account/userKeys
    [carts, brokenPhotos, account, userKeys, now],
  );
  const postedCount = useMemo(() => carts.filter((c) => isPostedBy(c, userKeys)).length, [carts, userKeys]);

  // Top priority: aged carts I haven't posted (longest on the lot first), then my listings due for a repost.
  // One cart per store in turn (T1, T2, T3, …), round after round. Aged carts rank high on their own
  // (time on the lot) and keep their "days on lot" chip. Listings due for a repost get their own section below.
  const list = useMemo(() => roundRobin(stores), [stores]);
  const reposts = useMemo(() => {
    const uid = userKeys[0] || '';
    if (!uid) return [];
    return carts.filter((c) => !c.flaggedDelete && !c.doNotPost && staleAccounts(c, relistAfterDays, now, uid).length).slice(0, MAX_REPOST);
  }, [carts, userKeys, relistAfterDays, now]);
  const [shown, setShown] = useState(PAGE);

  const card = (cart: MpCart, repost = false) => {
    const days = daysOnLot(cart, now);
    const aged = cart.stockedAt ? agedLevel(days, settings.aged) : null;
    return (
      <Box key={cart.docId} sx={{ display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, minHeight: 24 }}>
          <Chip size="small" variant="outlined" label={cart.locationId} />
          {aged && <Chip size="small" color={aged === 'urgent' ? 'error' : 'warning'} label={agedLabel(days)} />}
          {repost && <Chip size="small" color="info" label="Repost" />}
        </Stack>
        <Box sx={{ flexGrow: 1 }}><CartCard cart={cart} /></Box>
      </Box>
    );
  };
  const grid = { display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' };

  return (
    <MpShell>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 320px' }}>
          <Typography variant="h5">Suggested to post</Typography>
          <Typography color="text.secondary">
            {account ? <>Carts with photos not yet posted on <b>{account.name}</b></> : <>Carts with photos you haven't posted yet ({postedCount} of {carts.length} posted)</>}
            {' '}— one per store in order (T1, T2, T3 …), then around again.
          </Typography>
        </Box>
        {accounts.length > 0 && (
          <TextField select size="small" label="Posting on" value={accountId} onChange={(e) => pick(e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="me">Any account (not posted by me)</MenuItem>
            {grouped.flatMap(([group, list]) => [
              <ListSubheader key={`h-${group}`}>{group === 'Other' ? group : `${group} · ${locationName(group)}`}</ListSubheader>,
              ...list.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>),
            ])}
          </TextField>
        )}
      </Box>
      {cartsLoading && <Alert severity="info" sx={{ mb: 2 }}>Loading inventory… suggestions update as carts arrive.</Alert>}
      {list.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={grid}>{list.slice(0, shown).map((c) => card(c))}</Box>
          {shown < list.length && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Button onClick={() => setShown((s) => s + PAGE)}>Load more ({list.length - shown} left)</Button>
            </Box>
          )}
        </Box>
      )}
      {reposts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Due for a repost</Typography>
          <Box sx={grid}>{reposts.map((c) => card(c, true))}</Box>
        </Box>
      )}
      {!list.length && !reposts.length && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{cartsLoading ? 'Loading…' : 'Nothing left to post — nice work.'}</Typography>
      )}
    </MpShell>
  );
};

export default MpHome;
