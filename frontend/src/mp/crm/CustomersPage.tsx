import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from '@mui/material';
import { Add, Campaign, Download, Search } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import { locationName } from '../constants';
import CustomerDialog from './CustomerDialog';
import BroadcastDialog from './BroadcastDialog';
import { exportCustomersCsv, shortDateTime, useCustomers } from './crmData';
import type { Customer } from '../growthTypes';

/** Customer list: search, tag and store filters, opt-in consent, broadcast and CSV export. */
export default function CustomersPage() {
  const { profile } = useMp();
  const { customers, error } = useCustomers(profile);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('all');
  const [loc, setLoc] = useState('all');
  const [editing, setEditing] = useState<Customer | null>(null);
  // Deep link from global search: /mp/customers?customer=<id>
  const [params, setParams] = useSearchParams();
  const linkedCustomer = params.get('customer') ? customers.find((c) => c.id === params.get('customer')) || null : null;
  const shownCustomer = editing || linkedCustomer;
  const [adding, setAdding] = useState(false);
  const [broadcast, setBroadcast] = useState(false);

  const allTags = useMemo(() => [...new Set(customers.flatMap((c) => c.tags || []))].sort(), [customers]);
  const locations = useMemo(() => [...new Set(customers.map((c) => c.locationId).filter(Boolean))].sort(), [customers]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => tag === 'all' || (c.tags || []).includes(tag))
      .filter((c) => loc === 'all' || c.locationId === loc)
      .filter((c) => !q || [c.name, c.phone, c.email, (c.tags || []).join(' ')].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [customers, tag, loc, search]);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Customers</Typography>
        <Button startIcon={<Download />} disabled={!rows.length} onClick={() => exportCustomersCsv(rows)}>Export CSV</Button>
        <Button variant="outlined" startIcon={<Campaign />} disabled={!rows.length} onClick={() => setBroadcast(true)}>Broadcast</Button>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAdding(true)}>Add</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Buyers and contacts, with the channels each one agreed to hear from us on. Only message people who opted in.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField size="small" fullWidth placeholder="Search name, phone, email, tag" value={search} onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }} sx={{ mb: 1.5 }} />
      {allTags.length > 0 && (
        <ChipFilter label="Tag" value={tag} options={[{ value: 'all', label: 'All' }, ...allTags.map((t) => ({ value: t, label: t }))]} onChange={setTag} />
      )}
      {locations.length > 1 && (
        <ChipFilter label="Store" value={loc} options={[{ value: 'all', label: 'All' }, ...locations.map((l) => ({ value: l, label: l }))]} onChange={setLoc} />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{rows.length} customer{rows.length === 1 ? '' : 's'}</Typography>
      {!rows.length && <Typography color="text.secondary" sx={{ py: 3 }}>No customers yet. Buyers are added automatically when you mark a lead sold.</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
        {rows.map((c) => (
          <Paper key={c.id} variant="outlined" onClick={() => setEditing(c)} sx={{ p: 1.25, cursor: 'pointer', '&:hover': { boxShadow: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{ fontWeight: 600, flexGrow: 1 }} noWrap>{c.name || c.phone || c.email}</Typography>
              {c.locationId && <Typography variant="caption" color="text.secondary">{locationName(c.locationId)}</Typography>}
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap>{[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
              <Chip size="small" label="SMS" color={c.consentSms ? 'success' : 'default'} variant={c.consentSms ? 'filled' : 'outlined'} />
              <Chip size="small" label="WhatsApp" color={c.consentWhatsapp ? 'success' : 'default'} variant={c.consentWhatsapp ? 'filled' : 'outlined'} />
              <Chip size="small" label="Email" color={c.consentEmail ? 'success' : 'default'} variant={c.consentEmail ? 'filled' : 'outlined'} />
              {(c.tags || []).map((t) => <Chip key={t} size="small" variant="outlined" color="secondary" label={t} />)}
            </Box>
            {(c.lastPurchaseAt || c.reviewRequestedAt) && (
              <Typography variant="caption" color="text.secondary">
                {c.lastPurchaseAt ? `Bought ${shortDateTime(c.lastPurchaseAt)}` : ''}
                {c.lastPurchaseAt && c.reviewRequestedAt ? ' · ' : ''}
                {c.reviewRequestedAt ? `Review asked ${shortDateTime(c.reviewRequestedAt)}` : ''}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
      <CustomerDialog open={adding || !!shownCustomer} customer={shownCustomer ? customers.find((c) => c.id === shownCustomer.id) || shownCustomer : null}
        allTags={allTags} onClose={() => { setAdding(false); setEditing(null); if (params.has('customer')) setParams({}, { replace: true }); }} />
      <BroadcastDialog open={broadcast} customers={rows} onClose={() => setBroadcast(false)} />
    </MpShell>
  );
}
