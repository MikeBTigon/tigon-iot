import React, { useMemo, useState } from 'react';
import { Alert, Box, Chip, ListSubheader, MenuItem, Stack, TextField, Typography } from '@mui/material';
import MpShell from '../components/MpShell';
import CartGrid from '../components/CartGrid';
import CartCard from '../components/CartCard';
import { useMp } from '../MpDataContext';
import { canSuggest, groupAccounts, isPostedBy, suggestedByStore } from '../cartUtils';
import { usePostingAccountId } from '../useAutoMarkPosted';
import { locationName } from '../constants';
import { readLocal, writeLocal } from '../../ui/prefs';
import { useMpSettings, useNow } from '../crm/crmData';
import { useSalesSettings } from '../sales/salesData';
import { agedLabel, agedLevel, daysOnLot, staleAccounts } from '../sales/inventory/inventoryUtils';
import type { MpCart } from '../types';

const MAX_FIRST = 12;
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
  const { first, rest } = useMemo(() => {
    const uid = userKeys[0] || '';
    const chips = new Map<string, { cart: MpCart; aged?: { days: number; urgent: boolean }; repost?: boolean }>();
    carts
      .filter((c) => canSuggest(c, brokenPhotos) && c.stockedAt && notPostedHere(c))
      .map((c) => ({ c, days: daysOnLot(c, now) }))
      .filter((x) => agedLevel(x.days, settings.aged))
      .sort((a, b) => b.days - a.days)
      .slice(0, MAX_FIRST)
      .forEach((x) => chips.set(x.c.docId, { cart: x.c, aged: { days: x.days, urgent: agedLevel(x.days, settings.aged) === 'urgent' } }));
    if (uid) {
      carts
        .filter((c) => !c.flaggedDelete && !c.doNotPost && staleAccounts(c, relistAfterDays, now, uid).length)
        .slice(0, MAX_FIRST)
        .forEach((c) => chips.set(c.docId, { ...(chips.get(c.docId) || { cart: c }), repost: true }));
    }
    const rest = stores
      .map(([loc, list]) => [loc, list.filter((c) => !chips.has(c.docId))] as [string, MpCart[]])
      .filter(([, list]) => list.length);
    return { first: [...chips.values()], rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notPostedHere depends on account/userKeys
  }, [carts, userKeys, brokenPhotos, now, settings.aged, relistAfterDays, stores, account]);

  return (
    <MpShell>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 320px' }}>
          <Typography variant="h5">Suggested to post</Typography>
          <Typography color="text.secondary">
            {account ? <>Carts with photos not yet posted on <b>{account.name}</b></> : <>Carts with photos you haven't posted yet ({postedCount} of {carts.length} posted)</>}
            {' '}— store by store, longest on the lot and lowest price first.
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
      {rest.map(([loc, list]) => (
        <Box key={loc} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            {loc}{locationName(loc) && loc !== 'Other' ? ` · ${locationName(loc)}` : ''}
            <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>{list.length} cart{list.length === 1 ? '' : 's'}</Typography>
          </Typography>
          <CartGrid carts={list} />
        </Box>
      ))}
      {!rest.length && !first.length && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{cartsLoading ? 'Loading…' : 'Nothing left to post — nice work.'}</Typography>
      )}
    </MpShell>
  );
};

export default MpHome;
