import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardActionArea, Chip, InputAdornment, ListSubheader, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CartPhoto from '../components/CartPhoto';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import { formatPrice, groupAccounts, matchesSearch, timeAgo, workingPhotos } from '../cartUtils';
import { DEALERSHIPS, locationName } from '../constants';
import type { MpCart } from '../types';

const PAGE = 40;

interface Row {
  cart: MpCart;
  /** Account posts, newest first. */
  posts: Array<{ accountId: string; name: string; by: string; ts: number }>;
  /** People who marked it posted without an account. */
  people: Array<{ by: string; ts: number }>;
  last: number;
}

/** Post & share → Posted: every cart the team has posted, which accounts it's on, who posted it and when. */
const MpPosted: React.FC = () => {
  const navigate = useNavigate();
  const { carts, accounts, users, brokenPhotos, userName, cartsLoading } = useMp();
  const [q, setQ] = useState('');
  const [store, setStore] = useState('all');
  const [account, setAccount] = useState('all');
  const [person, setPerson] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const grouped = useMemo(() => groupAccounts(accounts), [accounts]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const rows = useMemo<Row[]>(() => carts
    .map((cart) => {
      const posts = Object.entries(cart.postedAccounts)
        .map(([accountId, e]) => ({ accountId, name: accountName.get(accountId) || 'Removed account', by: e.by, ts: e.ts }))
        .sort((a, b) => b.ts - a.ts);
      const people = Object.entries(cart.postedBy).map(([by, ts]) => ({ by, ts })).sort((a, b) => b.ts - a.ts);
      return { cart, posts, people, last: Math.max(0, ...posts.map((p) => p.ts), ...people.map((p) => p.ts)) };
    })
    .filter((r) => r.posts.length || r.people.length)
    .sort((a, b) => b.last - a.last), [carts, accountName]);

  const filtered = useMemo(() => rows.filter((r) =>
    (store === 'all' || r.cart.locationId === store) &&
    (account === 'all' || r.posts.some((p) => p.accountId === account)) &&
    (person === 'all' || r.posts.some((p) => p.by === person) || r.people.some((p) => p.by === person)) &&
    matchesSearch(r.cart, q)), [rows, store, account, person, q]);

  const accountCount = rows.reduce((n, r) => n + r.posts.length, 0);
  const stores = useMemo(() => DEALERSHIPS.filter((d) => rows.some((r) => r.cart.locationId === d.id)), [rows]);
  const reset = () => setShown(PAGE);

  return (
    <MpShell>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">Posted</Typography>
        <Typography color="text.secondary">
          Every cart the team has posted — {rows.length} cart{rows.length === 1 ? '' : 's'} across {accountCount} account post{accountCount === 1 ? '' : 's'}, newest first.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <TextField size="small" placeholder="Search make, model, serial…" value={q} onChange={(e) => { setQ(e.target.value); reset(); }}
          sx={{ flex: '1 1 220px' }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
        <TextField select size="small" label="Store" value={store} onChange={(e) => { setStore(e.target.value); reset(); }} sx={{ minWidth: 170 }}>
          <MenuItem value="all">All stores</MenuItem>
          {stores.map((d) => <MenuItem key={d.id} value={d.id}>{d.id} · {d.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Account" value={account} onChange={(e) => { setAccount(e.target.value); reset(); }} sx={{ minWidth: 200 }}>
          <MenuItem value="all">All accounts</MenuItem>
          {grouped.flatMap(([group, list]) => [
            <ListSubheader key={`h-${group}`}>{group === 'Other' ? group : `${group} · ${locationName(group)}`}</ListSubheader>,
            ...list.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>),
          ])}
        </TextField>
        <TextField select size="small" label="Posted by" value={person} onChange={(e) => { setPerson(e.target.value); reset(); }} sx={{ minWidth: 160 }}>
          <MenuItem value="all">Anyone</MenuItem>
          {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name}</MenuItem>)}
        </TextField>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {cartsLoading ? 'Loading inventory…' : `${filtered.length} cart${filtered.length === 1 ? '' : 's'}`}
      </Typography>

      <Stack spacing={1.5}>
        {filtered.slice(0, shown).map((r) => (
          <Card key={r.cart.docId} variant="outlined">
            <CardActionArea onClick={() => navigate(`/mp/cart/${encodeURIComponent(r.cart.docId)}`)}
              sx={{ display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start' }}>
              <Box sx={{ width: { xs: 96, sm: 140 }, flexShrink: 0 }}>
                <CartPhoto file={workingPhotos(r.cart, brokenPhotos)[0]} height={96} alt={cartTitle(r.cart)} />
              </Box>
              <Box sx={{ p: 1.5, minWidth: 0, flexGrow: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 600 }}>{cartTitle(r.cart)}</Typography>
                  <Typography color="primary" sx={{ fontWeight: 700 }}>{formatPrice(r.cart.price)}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {r.cart.locationId} · {locationName(r.cart.locationId)} · last posted {timeAgo(r.last)}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                  {r.posts.map((p) => (
                    <Chip key={p.accountId} size="small" color="success" variant="outlined"
                      label={`${p.name} · ${userName(p.by)} · ${timeAgo(p.ts)}`} />
                  ))}
                  {!r.posts.length && r.people.map((p) => (
                    <Chip key={p.by} size="small" variant="outlined" label={`Posted by ${userName(p.by)} · ${timeAgo(p.ts)} (no account ticked)`} />
                  ))}
                </Box>
              </Box>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
      {shown < filtered.length && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Button onClick={() => setShown((s) => s + PAGE)}>Load more ({filtered.length - shown} left)</Button>
        </Box>
      )}
      {!cartsLoading && !filtered.length && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {rows.length ? 'No posted carts match these filters.' : 'Nothing posted yet.'}
        </Typography>
      )}
    </MpShell>
  );
};

export default MpPosted;
