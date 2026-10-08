// Track 3 — /mp/prequal: customers who pre-qualified online; set the lender status, credit tier and approved amount.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { AccountBalance, Calculate } from '@mui/icons-material';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { updateLead } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Prequal, PrequalStatus } from '../salesTypes';
import { prequalUrl } from '../salesData';
import {
  CREDIT_RANGE_LABEL, PREQUAL_STATUSES, PREQUAL_STATUS_COLOR, PREQUAL_STATUS_LABEL, TIER_OPTIONS, money0, storeName, useRecent,
} from './closingUtils';

type P = Prequal & { consent?: boolean; ownerUid?: string };
type Tier = typeof TIER_OPTIONS[number];

const PrequalCard: React.FC<{ p: P }> = ({ p }) => {
  const navigate = useNavigate();
  const { userName } = useMp();
  const [status, setStatus] = useState<PrequalStatus>(p.status);
  const [tier, setTier] = useState<Tier | ''>(p.creditTier || '');
  const [amount, setAmount] = useState(p.approvedAmount ? String(p.approvedAmount) : '');
  const [lender, setLender] = useState(p.lender || '');
  const [busy, setBusy] = useState(false);
  const dirty = status !== p.status || tier !== (p.creditTier || '') || amount !== (p.approvedAmount ? String(p.approvedAmount) : '') || lender !== (p.lender || '');

  const save = async () => {
    setBusy(true);
    try {
      const approvedAmount = Math.round(Number(amount.replace(/[$,\s]/g, ''))) || 0;
      const now = Date.now();
      await updateDoc(doc(db, SALES_COLLECTIONS.prequal, p.id), {
        status, creditTier: tier || null, approvedAmount: approvedAmount || null, lender: lender.trim() || null, updatedAt: now,
      });
      if (p.leadId) {
        await updateLead(p.leadId, { prequalStatus: status, ...(tier ? { creditTier: tier } : {}) })
          .catch(() => notify('Saved. The lead belongs to someone else, so only they or a manager can update it.', 'info'));
      }
      notify('Saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 700 }}>{p.name}</Typography>
            <Typography variant="body2"><a href={`tel:${p.phone}`}>{p.phone}</a>{p.email ? ` · ${p.email}` : ''}</Typography>
            <Typography variant="body2" color="text.secondary">
              Credit: {CREDIT_RANGE_LABEL[p.creditRange] || p.creditRange}
              {p.monthlyBudget ? ` · budget ${money0(p.monthlyBudget)}/mo` : ''}{p.downPayment ? ` · ${money0(p.downPayment)} down` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {p.storeId ? ` · ${storeName(p.storeId)}` : ''}{p.ownerUid ? ` · ${userName(p.ownerUid)}` : ''}{p.consent ? ' · OK to call/text' : ''}
            </Typography>
          </Box>
          <Chip color={PREQUAL_STATUS_COLOR[p.status]} label={PREQUAL_STATUS_LABEL[p.status]} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.4fr 0.8fr 1fr 1.2fr' }, gap: 1, mt: 1.5 }}>
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value as PrequalStatus)}>
            {PREQUAL_STATUSES.map((s) => <MenuItem key={s} value={s}>{PREQUAL_STATUS_LABEL[s]}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Credit tier" value={tier} onChange={(e) => setTier(e.target.value as Tier | '')}>
            <MenuItem value="">—</MenuItem>
            {TIER_OPTIONS.map((t) => <MenuItem key={t} value={t}>Tier {t}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Approved for" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
          <TextField size="small" label="Lender" value={lender} onChange={(e) => setLender(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="contained" disabled={!dirty || busy} onClick={save}>Save</Button>
          {p.leadId && <Button size="small" startIcon={<Calculate />} onClick={() => navigate(`/mp/finance?lead=${encodeURIComponent(p.leadId || '')}`)}>Open calculator</Button>}
        </Box>
      </CardContent>
    </Card>
  );
};

const PrequalsPage: React.FC = () => {
  const { profile } = useMp();
  const { rows, error, loaded } = useRecent<P>(SALES_COLLECTIONS.prequal, 'createdAt', 300);
  const [scope, setScope] = useState<'store' | 'all'>(profile?.location ? 'store' : 'all');
  const [status, setStatus] = useState<PrequalStatus | 'open' | 'any'>('open');
  const shown = useMemo(() => rows.filter((p) => (scope === 'all' || !profile?.location || p.storeId === profile.location || p.ownerUid === profile.uid))
    .filter((p) => (status === 'any' ? true : status === 'open' ? !['approved', 'declined'].includes(p.status) : p.status === status)), [rows, scope, status, profile]);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <AccountBalance color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Pre-qualifications</Typography>
        {profile?.location && (
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_e, v) => v && setScope(v)}>
            <ToggleButton value="store">My store</ToggleButton>
            <ToggleButton value="all">All stores</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Customers fill a short form at <b>{prequalUrl(profile?.location).replace('https://', '')}</b>, then apply with a lender's soft-pull link.
        Text the link from any lead. Set the tier here and the calculator shows the right rates.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {(['open', ...PREQUAL_STATUSES, 'any'] as const).map((s) => (
          <Chip key={s} label={s === 'open' ? 'Still working' : s === 'any' ? 'All' : PREQUAL_STATUS_LABEL[s]} color={status === s ? 'primary' : 'default'}
            variant={status === s ? 'filled' : 'outlined'} onClick={() => setStatus(s)} />
        ))}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loaded && !shown.length && <Alert severity="info">Nothing here.</Alert>}
      <Stack spacing={1.5}>{shown.map((p) => <PrequalCard key={`${p.id}_${p.updatedAt}`} p={p} />)}</Stack>
    </MpShell>
  );
};

export default PrequalsPage;
