// Track 5 — Referral program (/mp/referrals): every referral code with leads, sales and rewards; mark rewards paid;
// create a link for any customer; copy or text the link.
import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, ContentCopy, Paid, Sms } from '@mui/icons-material';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { DEALERSHIPS, locationName } from '../../constants';
import { isManager } from '../../crm/crmData';
import { timeAgo } from '../../cartUtils';
import { notify } from '../../../ui/notify';
import { referralUrl } from '../salesData';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Referral } from '../salesTypes';
import { createReferral, money, useReferrals } from './marketingData';
import { useReferralActions } from './useReferralActions';

const CreateDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { profile } = useMp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState(profile?.location && profile.location !== 'T0' ? profile.location : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      const code = await createReferral({ name, phone, storeId: storeId || undefined, createdBy: profile.uid });
      notify(`Referral link ready: ${referralUrl(code)}`, 'success');
      setName('');
      setPhone('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the link');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Create a referral link</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">For any happy customer. They share the link; when a friend buys, they earn the reward.</Typography>
          <TextField label="Customer name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Mobile phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          <TextField select label="Store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <MenuItem value="">—</MenuItem>
            {DEALERSHIPS.filter((d) => d.id !== 'T0').map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState || d.name}</MenuItem>)}
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={save}>Create link</Button>
      </DialogActions>
    </Dialog>
  );
};

const ReferralsPage: React.FC = () => {
  const { profile } = useMp();
  const manager = isManager(profile);
  const { referrals, loaded, error } = useReferrals(!!profile);
  const { copy, text, busy, settings } = useReferralActions();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Referral | null>(null);
  const [amount, setAmount] = useState('');
  const [search, setSearch] = useState('');
  const [onlyOwed, setOnlyOwed] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return referrals
      .filter((r) => !onlyOwed || r.rewardsOwed > 0)
      .filter((r) => !q || `${r.name} ${r.phone} ${r.code}`.toLowerCase().includes(q))
      .sort((a, b) => (b.rewardsOwed - a.rewardsOwed) || (b.sales - a.sales) || (b.leads - a.leads) || (b.createdAt - a.createdAt));
  }, [referrals, search, onlyOwed]);
  const totals = useMemo(() => referrals.reduce((t, r) => ({
    leads: t.leads + (r.leads || 0), sales: t.sales + (r.sales || 0), owed: t.owed + (r.rewardsOwed || 0), paid: t.paid + (r.rewardsPaid || 0),
  }), { leads: 0, sales: 0, owed: 0, paid: 0 }), [referrals]);

  const markPaid = async () => {
    if (!paying) return;
    const n = Math.round(Number(amount));
    if (!(n > 0) || n > paying.rewardsOwed) {
      notify(`Enter an amount up to ${money(paying.rewardsOwed)}`, 'error');
      return;
    }
    try {
      await updateDoc(doc(db, SALES_COLLECTIONS.referrals, paying.code || paying.id), {
        rewardsPaid: increment(n), rewardsOwed: increment(-n), lastPaidAt: Date.now(), lastPaidBy: profile?.uid || '',
      });
      notify(`${money(n)} marked paid to ${paying.name}`, 'success');
      setPaying(null);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save', 'error');
    }
  };

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Referrals</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>Create referral link</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Buyers get their own link after a sale. When a friend buys through it, they earn {money(settings.referral.rewardAmount)}.
      </Typography>
      {!settings.referral.enabled && <Alert severity="info" sx={{ mb: 2 }}>Referrals are turned off in Sell more settings → Reviews &amp; referrals.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
        <Chip label={`${referrals.length} links`} />
        <Chip label={`${totals.leads} friends sent`} />
        <Chip color="success" label={`${totals.sales} sales`} />
        <Chip color={totals.owed ? 'warning' : 'default'} label={`${money(totals.owed)} owed`} onClick={() => setOnlyOwed((v) => !v)} variant={onlyOwed ? 'filled' : 'outlined'} />
        <Chip variant="outlined" label={`${money(totals.paid)} paid`} />
      </Stack>
      <TextField size="small" placeholder="Search name, phone or code" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2, width: { xs: '100%', sm: 320 } }} />

      {loaded && !rows.length ? (
        <Alert severity="info">{referrals.length ? 'Nothing matches.' : 'No referral links yet. They are created automatically when a lead is marked sold.'}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell align="right">Friends</TableCell>
                <TableCell align="right">Sales</TableCell>
                <TableCell align="right">Owed</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Link</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{r.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[r.code, r.storeId ? locationName(r.storeId) : '', r.lastUsedAt ? `used ${timeAgo(r.lastUsedAt)}` : ''].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{r.leads || 0}</TableCell>
                  <TableCell align="right">{r.sales || 0}</TableCell>
                  <TableCell align="right">
                    {r.rewardsOwed > 0 ? (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <b>{money(r.rewardsOwed)}</b>
                        {manager && <Button size="small" startIcon={<Paid />} onClick={() => { setPaying(r); setAmount(String(r.rewardsOwed)); }}>Mark paid</Button>}
                      </Box>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right">{r.rewardsPaid ? money(r.rewardsPaid) : '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Copy link"><IconButton size="small" onClick={() => copy(r)}><ContentCopy fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={`Text the link to ${r.name}`}>
                      <span><IconButton size="small" disabled={busy === r.code || !r.phone} onClick={() => text(r)}><Sms fontSize="small" /></IconButton></span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <Dialog open={!!paying} onClose={() => setPaying(null)} fullWidth maxWidth="xs">
        <DialogTitle>Mark reward paid</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{paying?.name} is owed {money(paying?.rewardsOwed || 0)}.</Typography>
          <TextField label="Amount paid ($)" type="number" fullWidth value={amount} onChange={(e) => setAmount(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaying(null)}>Cancel</Button>
          <Button variant="contained" onClick={markPaid}>Mark paid</Button>
        </DialogActions>
      </Dialog>
    </MpShell>
  );
};

export default ReferralsPage;
