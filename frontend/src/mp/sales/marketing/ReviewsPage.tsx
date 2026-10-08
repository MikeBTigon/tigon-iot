// Track 5 — Google reviews per store + new-arrival post generator for Google Business Profile (/mp/reviews, managers).
import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Grid, Link, MenuItem, Paper, Rating, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { ContentCopy, Download, OpenInNew, Refresh, RateReview, Star } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { DEALERSHIPS, DEALERSHIP_BY_ID, locationName } from '../../constants';
import { isManager } from '../../crm/crmData';
import { timeAgo } from '../../cartUtils';
import { notify } from '../../../ui/notify';
import { useSalesSettings } from '../salesData';
import type { MpCart } from '../../types';
import { arrivedAt, googlePostText } from './marketingCalc';
import { copyText, refreshReviewsNow, useStoreReviews } from './marketingData';
import type { StoreReviewsDoc } from './marketingData';

const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');
const PLACE_ID_HELP = 'https://developers.google.com/maps/documentation/places/web-service/place-id';

const Trend: React.FC<{ now: number; ago?: number; label: string }> = ({ now, ago, label }) => {
  if (ago === undefined) return null;
  const d = now - ago;
  return <Chip size="small" color={d > 0 ? 'success' : 'default'} variant={d > 0 ? 'filled' : 'outlined'} label={`${d > 0 ? '+' : ''}${d} ${label}`} />;
};

const StoreCard: React.FC<{ r: StoreReviewsDoc }> = ({ r }) => {
  const store = DEALERSHIP_BY_ID[r.storeId];
  const replyUrl = r.googleMapsUri || store?.maps || '';
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography sx={{ fontWeight: 700 }}>{locationName(r.storeId)}</Typography>
        {r.error ? (
          <Alert severity="warning" sx={{ mt: 1 }}>{r.error}</Alert>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{r.rating ? r.rating.toFixed(1) : '—'}</Typography>
              <Rating value={r.rating || 0} precision={0.1} readOnly size="small" />
              <Typography color="text.secondary">{r.count || 0} reviews</Typography>
            </Box>
            <Stack direction="row" spacing={0.75} sx={{ my: 1 }}>
              <Trend now={r.count || 0} ago={r.countWeekAgo} label="this week" />
              <Trend now={r.count || 0} ago={r.countMonthAgo} label="this month" />
            </Stack>
          </>
        )}
        <Stack spacing={1} sx={{ mt: 1 }}>
          {(r.latest || []).slice(0, 5).map((v, i) => (
            <Paper key={`${v.time}_${i}`} variant="outlined" sx={{ p: 1, borderLeft: `4px solid ${v.rating <= 3 ? '#af1f31' : '#2e7d32'}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Rating value={v.rating} readOnly size="small" />
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{v.author}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>{v.time ? timeAgo(v.time) : ''}</Typography>
              </Box>
              {v.text && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{v.text.length > 280 ? `${v.text.slice(0, 277)}…` : v.text}</Typography>}
            </Paper>
          ))}
        </Stack>
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
          {replyUrl && <Button size="small" variant="contained" startIcon={<RateReview />} href={replyUrl} target="_blank" rel="noopener">Reply on Google</Button>}
          {store?.review && <Button size="small" startIcon={<ContentCopy />} onClick={async () => notify(await copyText(store.review) ? 'Review link copied' : 'Could not copy', 'info')}>Copy review link</Button>}
        </Box>
        {r.updatedAt ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Checked {timeAgo(r.updatedAt)}</Typography> : null}
      </CardContent>
    </Card>
  );
};

const ReviewsTab: React.FC<{ manager: boolean }> = ({ manager }) => {
  const { settings, loaded } = useSalesSettings();
  const { reviews, error } = useStoreReviews();
  const [busy, setBusy] = useState(false);
  const configured = STORES.filter((d) => (settings.reviews.placeIds[d.id] || '').trim());
  const byStore = new Map(reviews.map((r) => [r.storeId, r]));
  const noKey = reviews.some((r) => r.error === 'Google Places key not set');

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await refreshReviewsNow();
      notify(r.message, r.errors.length ? 'error' : 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not refresh', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {manager && <Button variant="outlined" startIcon={<Refresh />} disabled={busy || !configured.length} onClick={refresh}>{busy ? 'Checking…' : 'Refresh now'}</Button>}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!settings.reviews.enabled && loaded && <Alert severity="info" sx={{ mb: 2 }}>Google reviews are turned off in Sell more settings → Reviews &amp; referrals.</Alert>}
      {(noKey || (loaded && !configured.length)) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <b>Set up Google reviews (one time):</b>
          <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            <li>Find each store's Google Place ID with <Link href={PLACE_ID_HELP} target="_blank" rel="noopener">Google's Place ID finder</Link> (search the store name, copy the ID that starts with "ChIJ").</li>
            <li>Paste it next to the store in <Link component={RouterLink} to="/mp/sales-settings#marketing">Sell more settings → Reviews &amp; referrals</Link>.</li>
            {noKey && <li>An admin must add a Google Cloud API key with "Places API (New)" turned on as the GitHub secret <code>GOOGLE_PLACES_KEY</code>. Until then ratings can't load.</li>}
          </ol>
        </Alert>
      )}
      <Grid container spacing={2}>
        {configured.map((d) => (
          <Grid key={d.id} size={{ xs: 12, md: 6, lg: 4 }}>
            <StoreCard r={byStore.get(d.id) || { id: d.id, storeId: d.id, placeId: settings.reviews.placeIds[d.id], rating: 0, count: 0, latest: [], updatedAt: 0, error: 'Not checked yet — tap Refresh now.' }} />
          </Grid>
        ))}
      </Grid>
      <Alert severity="success" icon={<Star />} sx={{ mt: 2 }}>
        <b>Get more reviews:</b> happy buyers are the best source. Open a sold lead in <Link component={RouterLink} to="/mp/leads">Leads</Link> and tap <b>Review request</b>
        (it's also offered right after <b>Mark sold</b>), or share the store's review link (Copy review link above).
      </Alert>
    </>
  );
};

const PostsTab: React.FC = () => {
  const { profile, carts } = useMp();
  const [storeId, setStoreId] = useState(() => (profile?.location && DEALERSHIP_BY_ID[profile.location] && profile.location !== 'T0' ? profile.location : 'T1'));
  const [cartId, setCartId] = useState('');
  const [now] = useState(() => Date.now());
  const arrivals = useMemo(() => carts
    .filter((c) => c.locationId === storeId && c.inStock !== false && !c.soldLocally && arrivedAt(c as MpCart & { firstSeenAt?: number }) >= now - 7 * 86_400_000)
    .sort((a, b) => arrivedAt(b as MpCart & { firstSeenAt?: number }) - arrivedAt(a as MpCart & { firstSeenAt?: number })), [carts, storeId, now]);
  const cart = arrivals.find((c) => c.docId === cartId) || arrivals[0];
  const store = DEALERSHIP_BY_ID[storeId];
  const text = cart ? googlePostText(cart, (store?.cityState || '').split(',')[0], store?.phone || '1-844-844-6638') : '';
  const photo = cart?.photos?.[0] || '';

  return (
    <>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Post new arrivals on Google so they show up when people search for golf carts nearby. Google only lets approved apps post
        directly, so this is copy &amp; paste: copy the text, save the photo, then add a post in Google Business Profile.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField select size="small" label="Store" value={storeId} onChange={(e) => { setStoreId(e.target.value); setCartId(''); }} sx={{ minWidth: 200 }}>
          {STORES.map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState || d.name}</MenuItem>)}
        </TextField>
        {arrivals.length > 0 && (
          <TextField select size="small" label="Cart" value={cart?.docId || ''} onChange={(e) => setCartId(e.target.value)} sx={{ minWidth: 260 }}>
            {arrivals.map((c) => (
              <MenuItem key={c.docId} value={c.docId}>
                {[c.year, c.make, c.model, c.color].filter(Boolean).join(' ') || c.serial} · {timeAgo(arrivedAt(c as MpCart & { firstSeenAt?: number }))}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
      {!arrivals.length ? (
        <Alert severity="info">No carts arrived at {locationName(storeId)} in the last 7 days.</Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Grid container spacing={2}>
            {photo && (
              <Grid size={{ xs: 12, sm: 4 }}>
                <Box component="img" src={photo} alt="" sx={{ width: '100%', borderRadius: 1, objectFit: 'cover', aspectRatio: '4 / 3' }} />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: photo ? 8 : 12 }}>
              <TextField multiline minRows={4} fullWidth value={text} slotProps={{ htmlInput: { readOnly: true } }} helperText={`${text.length} / 1500 characters`} />
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<ContentCopy />} onClick={async () => notify(await copyText(text) ? 'Post text copied' : 'Could not copy — select the text and copy it', 'info')}>Copy text</Button>
                {photo && <Button variant="outlined" startIcon={<Download />} href={photo} target="_blank" rel="noopener" download>Download photo</Button>}
                <Button startIcon={<OpenInNew />} href="https://business.google.com/locations" target="_blank" rel="noopener">Open Google Business Profile</Button>
              </Box>
              {photo && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>On a phone: open the photo, then press and hold it to save.</Typography>}
            </Grid>
          </Grid>
        </Paper>
      )}
    </>
  );
};

const ReviewsPage: React.FC = () => {
  const { profile } = useMp();
  const manager = isManager(profile);
  const [tab, setTab] = useState<'reviews' | 'posts'>(() => (typeof location !== 'undefined' && location.hash === '#posts' ? 'posts' : 'reviews'));
  if (profile && !manager) {
    return <MpShell><Alert severity="info">Google reviews are for managers.</Alert></MpShell>;
  }
  return (
    <MpShell>
      <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 1 }}>Google reviews &amp; posts</Typography>
      <Tabs value={tab} onChange={(_e, v) => { setTab(v); history.replaceState(null, '', `#${v}`); }} sx={{ mb: 2 }}>
        <Tab value="reviews" label="Reviews" />
        <Tab value="posts" label="Google posts" />
      </Tabs>
      {tab === 'reviews' ? <ReviewsTab manager={manager} /> : <PostsTab />}
    </MpShell>
  );
};

export default ReviewsPage;
