import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Button, CircularProgress, InputAdornment, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material';
import { Add, Search } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import StatusChip from '../components/StatusChip';
import { lastDayKeys, summarize, useWhStats } from '../stats';
import { platformLabel } from '../snippet';
import { CHANNEL_LABEL } from '../../mp/crm/crmData';
import { ago, useDomains, useNow, useWebhooks } from '../components/Wh1Hooks';

/** All websites with webhook counts, last lead and leads in the last 7 days. */
const WhWebsites: React.FC = () => {
  const navigate = useNavigate();
  const now = useNow();
  const [q, setQ] = useState('');
  const { rows: domains, error } = useDomains();
  const { rows: webhooks } = useWebhooks();
  const { rows: stats } = useWhStats(7);

  const rows = useMemo(() => {
    const week = summarize(stats, lastDayKeys(7, now));
    const agg = new Map<string, { hooks: number; last: number }>();
    for (const w of webhooks || []) {
      const a = agg.get(w.domainId) || { hooks: 0, last: 0 };
      a.hooks += 1;
      a.last = Math.max(a.last, w.lastReceivedAt || 0);
      agg.set(w.domainId, a);
    }
    const needle = q.trim().toLowerCase();
    return (domains || [])
      .filter((d) => !needle || `${d.name} ${d.url} ${d.platform || ''}`.toLowerCase().includes(needle))
      .map((d) => ({ d, hooks: agg.get(d.id)?.hooks || 0, last: agg.get(d.id)?.last || 0, week: week.byDomain[d.id] || 0 }))
      .sort((a, b) => a.d.name.localeCompare(b.d.name));
  }, [domains, webhooks, stats, q, now]);

  return (
    <WhShell
      title="Websites"
      subtitle="Each website can have several forms (webhooks)"
      actions={<Button variant="contained" startIcon={<Add />} component={RouterLink} to="/wh/new">Add website</Button>}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
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
                <TableCell align="right">Forms</TableCell>
                <TableCell>Last lead</TableCell>
                <TableCell align="right">Leads (7 days)</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ d, hooks, last, week }) => (
                <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/wh/websites/${d.id}`)}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{d.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{d.url}</Typography>
                  </TableCell>
                  <TableCell>{platformLabel(d.platform)}</TableCell>
                  <TableCell>{CHANNEL_LABEL[(d.leadChannel || 'dba_website') as keyof typeof CHANNEL_LABEL] || d.leadChannel}</TableCell>
                  <TableCell align="right">{hooks}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{ago(last, now)}</TableCell>
                  <TableCell align="right">{week}</TableCell>
                  <TableCell><StatusChip status={d.status} /></TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={7}>No websites match "{q}".</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
    </WhShell>
  );
};

export default WhWebsites;
