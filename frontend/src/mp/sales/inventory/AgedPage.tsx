// Track 4 (inventory) — /mp/aged: carts sorted by days on the lot (aged + urgent flags, suggested price), and
// live Facebook listings per account (how many are older than the relist window).
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Campaign } from '@mui/icons-material';
import MpShell from '../../components/MpShell';
import CartPhoto from '../../components/CartPhoto';
import { cartTitle } from '../../cartLogic';
import { formatPrice, postedAccountCount, workingPhotos } from '../../cartUtils';
import { DEALERSHIPS, locationName } from '../../constants';
import { isOpenLead, useLeads, useMpSettings, useNow } from '../../crm/crmData';
import { useMp } from '../../MpDataContext';
import type { MpCart } from '../../types';
import { useSalesSettings } from '../salesData';
import { agedLevel, daysOnLot, staleAccounts, suggestedPrice } from './inventoryUtils';

const AgedRow: React.FC<{ cart: MpCart; days: number; leads: number }> = ({ cart, days, leads }) => {
  const navigate = useNavigate();
  const { brokenPhotos } = useMp();
  const { settings } = useSalesSettings();
  const level = cart.stockedAt ? agedLevel(days, settings.aged) : null;
  const suggested = level ? suggestedPrice(cart.price, settings.aged.suggestedCutPct) : 0;
  const posted = postedAccountCount(cart);
  const open = () => navigate(`/mp/cart/${encodeURIComponent(cart.docId)}`);
  return (
    <Paper sx={{ display: 'flex', gap: 1.5, p: 1, alignItems: 'stretch' }}>
      <Box sx={{ width: { xs: 96, sm: 140 }, minHeight: 96, flexShrink: 0, borderRadius: 1, overflow: 'hidden' }}>
        <CartPhoto file={workingPhotos(cart, brokenPhotos)[0]} height="100%" onClick={open} alt={cartTitle(cart)} />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, cursor: 'pointer', lineHeight: 1.25 }} onClick={open}>{cartTitle(cart)}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{cart.locationId} · {locationName(cart.locationId)}</Typography>
        <Stack direction="row" spacing={0.5} sx={{ my: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Chip size="small" color={level === 'urgent' ? 'error' : level === 'aged' ? 'warning' : 'default'}
            label={cart.stockedAt ? `${days} day${days === 1 ? '' : 's'}` : 'days unknown'} />
          {level === 'urgent' && <Chip size="small" color="error" variant="outlined" label="Urgent" />}
          {level === 'aged' && <Chip size="small" color="warning" variant="outlined" label="Aged" />}
          <Chip size="small" variant="outlined" label={`Posted on ${posted}`} />
          <Chip size="small" variant="outlined" label={`${leads} lead${leads === 1 ? '' : 's'}`} />
        </Stack>
        <Typography variant="body2">
          <b>{formatPrice(cart.price)}</b>
          {suggested > 0 && suggested < cart.price && <> · try <b>{formatPrice(suggested)}</b></>}
        </Typography>
        <Button size="small" variant="contained" startIcon={<Campaign />} sx={{ mt: 0.5 }}
          onClick={() => navigate(`/mp/prepare/${encodeURIComponent(cart.docId)}`)}>
          Post now
        </Button>
      </Box>
    </Paper>
  );
};

const AgedList: React.FC = () => {
  const { carts, cartsLoading, profile } = useMp();
  const { settings } = useSalesSettings();
  const { leads } = useLeads(profile);
  const now = useNow();
  const [store, setStore] = useState<string | null>(null);
  const [show, setShow] = useState<'aged' | 'all'>('aged');
  const storeId = store ?? (profile?.location || 'all');

  const leadCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) if (l.cartId && isOpenLead(l.status)) m.set(l.cartId, (m.get(l.cartId) || 0) + 1);
    return m;
  }, [leads]);

  const rows = useMemo(() => carts
    .filter((c) => !c.flaggedDelete && (storeId === 'all' || c.locationId === storeId))
    .map((c) => ({ cart: c, days: daysOnLot(c, now) }))
    .filter((r) => show === 'all' || (r.cart.stockedAt && agedLevel(r.days, settings.aged)))
    .sort((a, b) => b.days - a.days || b.cart.price - a.cart.price), [carts, storeId, show, now, settings.aged]);

  const urgent = rows.filter((r) => r.cart.stockedAt && agedLevel(r.days, settings.aged) === 'urgent').length;

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="aged-store">Store</InputLabel>
          <Select labelId="aged-store" label="Store" value={storeId} onChange={(e) => setStore(e.target.value)}>
            <MenuItem value="all">All stores</MenuItem>
            {DEALERSHIPS.filter((d) => d.id !== 'T0').map((d) => <MenuItem key={d.id} value={d.id}>{d.id} · {d.name}</MenuItem>)}
          </Select>
        </FormControl>
        <ToggleButtonGroup size="small" exclusive value={show} onChange={(_e, v) => v && setShow(v)}>
          <ToggleButton value="aged">Aged only</ToggleButton>
          <ToggleButton value="all">All carts</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        {show === 'aged'
          ? `${rows.length} cart${rows.length === 1 ? '' : 's'} on the lot ${settings.aged.flagDays}+ days${urgent ? ` (${urgent} over ${settings.aged.urgentDays})` : ''}. Post them again, or try the suggested price.`
          : `${rows.length} carts, longest on the lot first.`}
      </Typography>
      {cartsLoading && <Alert severity="info" sx={{ mb: 2 }}>Loading inventory…</Alert>}
      {!cartsLoading && !rows.length && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No aged carts here — nice.</Typography>}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {rows.slice(0, 200).map((r) => <AgedRow key={r.cart.docId} cart={r.cart} days={r.days} leads={leadCount.get(r.cart.docId) || 0} />)}
      </Box>
    </>
  );
};

const ListingsByAccount: React.FC = () => {
  const navigate = useNavigate();
  const { carts, accounts, profile } = useMp();
  const { relistAfterDays } = useMpSettings(!!profile);
  const now = useNow();
  const rows = useMemo(() => accounts.map((a) => {
    const live = carts.filter((c) => c.postedAccounts?.[a.id]);
    const stale = live.filter((c) => staleAccounts(c, relistAfterDays, now).includes(a.id));
    return { account: a, live: live.length, stale };
  }).filter((r) => r.live > 0).sort((a, b) => b.stale.length - a.stale.length || b.live - a.live), [accounts, carts, relistAfterDays, now]);

  return (
    <>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        Carts posted on each Facebook account that are still in stock. "Needs repost" = posted more than {relistAfterDays} days ago.
      </Typography>
      {!rows.length && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No live listings recorded yet.</Typography>}
      {rows.length > 0 && (
        <Paper sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell align="right">Live</TableCell>
                <TableCell align="right">Needs repost</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Oldest</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const oldest = r.stale.slice().sort((a, b) => (a.postedAccounts[r.account.id]?.ts || 0) - (b.postedAccounts[r.account.id]?.ts || 0)).slice(0, 3);
                return (
                  <TableRow key={r.account.id}>
                    <TableCell>{r.account.name}</TableCell>
                    <TableCell align="right">{r.live}</TableCell>
                    <TableCell align="right">
                      {r.stale.length ? <Chip size="small" color="warning" label={r.stale.length} /> : 0}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {oldest.map((c) => (
                        <Button key={c.docId} size="small" sx={{ textTransform: 'none', display: 'block', textAlign: 'left', p: 0 }}
                          onClick={() => navigate(`/mp/cart/${encodeURIComponent(c.docId)}`)}>
                          {cartTitle(c)}
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </>
  );
};

const AgedPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  return (
    <MpShell>
      <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 1 }}>Aged inventory</Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Longest on the lot" />
        <Tab label="Live listings by account" />
      </Tabs>
      {tab === 0 ? <AgedList /> : <ListingsByAccount />}
    </MpShell>
  );
};

export default AgedPage;
