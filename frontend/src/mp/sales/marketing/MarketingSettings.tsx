// Track 5 — "Reviews & referrals" tab of Sell more settings (admins): Google Place IDs, low-star alert, referral reward.
import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, FormControlLabel, Grid, InputAdornment, Link, MenuItem, Paper, Stack, Switch,
  TextField, Typography,
} from '@mui/material';
import { Refresh, Save } from '@mui/icons-material';
import { DEALERSHIPS } from '../../constants';
import { notify } from '../../../ui/notify';
import { saveSalesSection, useSalesSettings } from '../salesData';
import type { SalesSettings } from '../salesTypes';
import { refreshReviewsNow, useStoreReviews } from './marketingData';

const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');
const PLACE_ID_HELP = 'https://developers.google.com/maps/documentation/places/web-service/place-id';

/** Key status from the newest mp_reviews snapshot. */
function useKeyStatus(): { tone: 'success' | 'warning' | 'info'; text: string } {
  const { reviews } = useStoreReviews();
  const newest = [...reviews].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (!newest) return { tone: 'info', text: 'Not checked yet. Add Place IDs, save, then tap Refresh now.' };
  if (newest.error === 'Google Places key not set') {
    return { tone: 'warning', text: 'Google Places key not set. An admin needs to add GOOGLE_PLACES_KEY (a Google Cloud API key with "Places API (New)" turned on) as a GitHub secret; it is used on the next deploy.' };
  }
  if (newest.error) return { tone: 'warning', text: newest.error };
  return { tone: 'success', text: `Google key works — last checked ${new Date(newest.updatedAt).toLocaleString()}.` };
}

const ReviewsSection: React.FC<{ initial: SalesSettings['reviews'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState<'' | 'save' | 'refresh'>('');
  const key = useKeyStatus();
  const save = async () => {
    setBusy('save');
    try {
      const placeIds = Object.fromEntries(Object.entries(v.placeIds).map(([k, p]) => [k, String(p || '').trim()]).filter(([, p]) => p));
      await saveSalesSection('reviews', { ...v, placeIds });
      notify('Review settings saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setBusy('');
    }
  };
  const refresh = async () => {
    setBusy('refresh');
    try {
      const r = await refreshReviewsNow();
      notify(r.message, r.errors.length ? 'error' : 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not refresh', 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>Google reviews</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Every morning we check each store's Google rating and newest reviews, and alert the store's managers about low-star reviews so they can reply fast.
      </Typography>
      <FormControlLabel control={<Switch checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />} label="Check Google reviews" />
      <Alert severity={key.tone} sx={{ my: 1 }}>{key.text}</Alert>
      <TextField
        select size="small" label="Alert managers about reviews of" value={v.alertAtOrBelow}
        onChange={(e) => setV({ ...v, alertAtOrBelow: Number(e.target.value) })} sx={{ my: 1, minWidth: 260 }}
      >
        {[1, 2, 3, 4].map((n) => <MenuItem key={n} value={n}>{n} star{n === 1 ? '' : 's'}{n < 5 ? ' or less' : ''}</MenuItem>)}
      </TextField>
      <Typography sx={{ fontWeight: 600, mt: 1 }}>Google Place ID per store</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Find it with <Link href={PLACE_ID_HELP} target="_blank" rel="noopener">Google's Place ID finder</Link>: search the store, copy the ID (starts with "ChIJ"). Leave blank to skip a store.
      </Typography>
      <Grid container spacing={1.5}>
        {STORES.map((d) => (
          <Grid key={d.id} size={{ xs: 12, sm: 6 }}>
            <TextField
              size="small" fullWidth label={d.cityState || d.name} value={v.placeIds[d.id] || ''} placeholder="ChIJ…"
              onChange={(e) => setV({ ...v, placeIds: { ...v.placeIds, [d.id]: e.target.value } })}
            />
          </Grid>
        ))}
      </Grid>
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<Save />} disabled={!!busy} onClick={save}>Save</Button>
        <Button variant="outlined" startIcon={busy === 'refresh' ? <CircularProgress size={16} /> : <Refresh />} disabled={!!busy} onClick={refresh}>Refresh now</Button>
      </Box>
    </Paper>
  );
};

const ReferralSection: React.FC<{ initial: SalesSettings['referral'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveSalesSection('referral', { ...v, rewardAmount: Math.max(0, Math.round(Number(v.rewardAmount) || 0)) });
      notify('Referral settings saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>Referral program</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Every buyer gets their own link after a sale, and the salesperson gets a to-do to send it. When a friend buys through the link, managers are told the reward is owed.
      </Typography>
      <Stack spacing={2}>
        <FormControlLabel control={<Switch checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />} label="Referral program on" />
        <TextField
          size="small" type="number" label="Reward per sale" value={v.rewardAmount} sx={{ maxWidth: 200 }}
          onChange={(e) => setV({ ...v, rewardAmount: Number(e.target.value) })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
        />
        <TextField
          label="Text sent with the link" multiline minRows={3} value={v.template}
          onChange={(e) => setV({ ...v, template: e.target.value })}
          helperText="You can use {first} (buyer's first name), {store}, {reward} and {link}."
        />
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Button variant="contained" startIcon={<Save />} disabled={busy} onClick={save}>Save</Button>
    </Paper>
  );
};

const MarketingSettings: React.FC<object> = () => {
  const { settings, loaded } = useSalesSettings();
  if (!loaded) return <CircularProgress />;
  return (
    <>
      <ReviewsSection initial={settings.reviews} />
      <ReferralSection initial={settings.referral} />
    </>
  );
};

export default MarketingSettings;
