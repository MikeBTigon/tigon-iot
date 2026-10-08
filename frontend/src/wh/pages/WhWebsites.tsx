import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Link, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material';
import { Add, Edit, Search } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import { patchWh } from '../data';
import { formatUsPhone, telHref } from '../phone';
import type { WhDomain } from '../types';
import StatusChip from '../components/StatusChip';
import { limit, orderBy, where } from 'firebase/firestore';
import { useWhCollection } from '../data';
import { WH } from '../types';
import type { WhSubmission } from '../types';
import { countByDomain, useAllTimeLeads } from '../leadCounts';
import { platformLabel } from '../snippet';
import { CHANNEL_LABEL } from '../../mp/crm/crmData';
import { ago, DAY_MS, errText, useDomains, useNow, useWebhooks } from '../components/Wh1Hooks';

/** All websites with webhook counts, last lead, and leads in the last 7 days / all time (counted from the submissions). */
const WhWebsites: React.FC = () => {
  const navigate = useNavigate();
  const now = useNow();
  const [q, setQ] = useState('');
  const [phoneFor, setPhoneFor] = useState<WhDomain | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');
  const phone = formatUsPhone(phoneInput);
  const openPhone = (d: WhDomain) => { setPhoneFor(d); setPhoneInput(d.phone || ''); setPhoneErr(''); };
  const savePhone = async () => {
    if (!phoneFor || phone.error) return;
    setPhoneBusy(true);
    try {
      await patchWh(WH.domains, phoneFor.id, { phone: phone.phone });
      setPhoneFor(null);
    } catch (e) {
      setPhoneErr(errText(e));
    } finally {
      setPhoneBusy(false);
    }
  };
  const { rows: domains, error } = useDomains();
  const { rows: webhooks } = useWebhooks();
  const since = now - 7 * DAY_MS;
  const { rows: recent } = useWhCollection<WhSubmission>(
    WH.submissions, [where('receivedAt', '>=', since), orderBy('receivedAt', 'desc'), limit(10000)], [since],
  );
  const domainIds = useMemo(() => domains?.map((d) => d.id), [domains]);
  const { counts: allTime, error: countError } = useAllTimeLeads(domainIds);

  const rows = useMemo(() => {
    const week = countByDomain(recent, since);
    const agg = new Map<string, { hooks: number; last: number }>();
    for (const w of webhooks || []) {
      const a = agg.get(w.domainId) || { hooks: 0, last: 0 };
      a.hooks += 1;
      a.last = Math.max(a.last, w.lastReceivedAt || 0);
      agg.set(w.domainId, a);
    }
    const needle = q.trim().toLowerCase();
    return (domains || [])
      .filter((d) => !needle || `${d.name} ${d.url} ${d.platform || ''} ${d.phone || ''} ${(d.phone || '').replace(/\D/g, '')}`.toLowerCase().includes(needle))
      .map((d) => ({ d, hooks: agg.get(d.id)?.hooks || 0, last: agg.get(d.id)?.last || 0, week: recent ? week[d.id] || 0 : undefined, total: allTime[d.id] }))
      .sort((a, b) => a.d.name.localeCompare(b.d.name));
  }, [domains, webhooks, recent, since, allTime, q]);

  return (
    <WhShell
      title="Websites"
      subtitle="Each website can have several forms (webhooks)"
      actions={<Button variant="contained" startIcon={<Add />} component={RouterLink} to="/wh/new">Add website</Button>}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {countError && <Alert severity="warning" sx={{ mb: 2 }}>Some lead totals could not be counted: {countError}</Alert>}
      <TextField
        size="small" placeholder="Search websites" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2, width: { xs: '100%', sm: 360 } }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
      />
      {domains === undefined ? <CircularProgress aria-label="Loading" /> : !domains.length ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ mb: 2 }}>No websites yet. Add one to get its form code.</Typography>
          <Button variant="contained" startIcon={<Add />} component={RouterLink} to="/wh/new">Add your first website</Button>
        </Paper>
      ) : (
        <Paper sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Website</TableCell>
                <TableCell>Builder</TableCell>
                <TableCell>Lead channel</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell align="right">Forms</TableCell>
                <TableCell>Last lead</TableCell>
                <TableCell align="right">Leads (7 days)</TableCell>
                <TableCell align="right">Total leads</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ d, hooks, last, week, total }) => (
                <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/wh/websites/${d.id}`)}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{d.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{d.url}</Typography>
                  </TableCell>
                  <TableCell>{platformLabel(d.platform)}</TableCell>
                  <TableCell>{CHANNEL_LABEL[(d.leadChannel || 'dba_website') as keyof typeof CHANNEL_LABEL] || d.leadChannel}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {d.phone ? (
                      <>
                        <Link href={telHref(d.phone)}>{d.phone}</Link>
                        <IconButton size="small" aria-label="Edit phone" onClick={() => openPhone(d)}><Edit fontSize="inherit" /></IconButton>
                      </>
                    ) : (
                      <Button size="small" onClick={() => openPhone(d)}>Add phone</Button>
                    )}
                  </TableCell>
                  <TableCell align="right">{hooks}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{ago(last, now)}</TableCell>
                  <TableCell align="right">{week ?? '…'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{total ?? '…'}</TableCell>
                  <TableCell><StatusChip status={d.status} /></TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={9}>No websites match "{q}".</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Dialog open={!!phoneFor} onClose={() => !phoneBusy && setPhoneFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Phone number — {phoneFor?.name}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth type="tel" label="Website phone number" value={phoneInput} sx={{ mt: 1 }} placeholder="215-555-0123"
            onChange={(e) => setPhoneInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void savePhone(); }}
            onBlur={() => { if (phone.phone) setPhoneInput(phone.phone); }} error={!!phone.error}
            helperText={phone.error || (phone.phone ? `Saved as ${phone.phone}` : 'Type it any way — it is saved as +1-xxx-xxx-xxxx. Leave empty to remove.')} />
          {phoneErr && <Alert severity="error" sx={{ mt: 2 }}>{phoneErr}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhoneFor(null)} disabled={phoneBusy}>Cancel</Button>
          <Button variant="contained" onClick={() => void savePhone()} disabled={phoneBusy || !!phone.error}>Save</Button>
        </DialogActions>
      </Dialog>
    </WhShell>
  );
};

export default WhWebsites;
