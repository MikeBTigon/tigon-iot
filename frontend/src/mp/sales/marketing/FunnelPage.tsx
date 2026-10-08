// Track 5 — Sales funnel (/mp/funnel, managers): Leads → Contacted → Appointment → Test drive → Quote sent → Sold,
// per salesperson, per store and per source. Leads are loaded with one query (createdAt ≥ start) and filtered here.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { TrendingDown } from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { COLLECTIONS, DEALERSHIPS, locationName } from '../../constants';
import { isManager, toDateInput } from '../../crm/crmData';
import { FUNNEL_STAGES, computeFunnel, pct, periodRange, sourceLabel } from './marketingCalc';
import type { FunnelLead, FunnelRow, PeriodId } from './marketingCalc';
import { money } from './marketingData';

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'custom', label: 'Pick dates' },
];

const COLORS = ['#0e4671', '#1f5f8f', '#3277a8', '#4a8fbf', '#6aa7d0', '#2e7d32'];

/** Leads created since `start` (re-queried when start changes). */
function useLeadsSince(start: number, enabled: boolean) {
  const [state, setState] = useState<{ start: number; leads: FunnelLead[]; error: string }>({ start: -1, leads: [], error: '' });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getDocs(query(collection(db, COLLECTIONS.leads), where('createdAt', '>=', start)))
      .then((snap) => { if (alive) setState({ start, leads: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FunnelLead), error: '' }); })
      .catch((e: Error) => { if (alive) setState({ start, leads: [], error: e.message }); });
    return () => { alive = false; };
  }, [start, enabled]);
  return { leads: state.leads, error: state.error, loading: state.start !== start };
}

const Bar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => (
  <Box sx={{ flexGrow: 1, bgcolor: 'action.hover', borderRadius: 1, height: 28, overflow: 'hidden' }}>
    <Box sx={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, height: '100%', bgcolor: color, borderRadius: 1, transition: 'width .3s' }} />
  </Box>
);

const RowsTable: React.FC<{ title: string; rows: FunnelRow[]; label: (key: string) => string; showResponse?: boolean }> = ({ title, rows, label, showResponse }) => (
  <Paper variant="outlined" sx={{ mb: 2 }}>
    <Typography sx={{ fontWeight: 700, px: 2, pt: 1.5 }}>{title}</Typography>
    {rows.length === 0 ? (
      <Typography color="text.secondary" sx={{ px: 2, pb: 2, pt: 1 }}>No leads in this period.</Typography>
    ) : (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Leads</TableCell>
              <TableCell align="right">Contacted</TableCell>
              {showResponse && <TableCell align="right">Avg reply</TableCell>}
              <TableCell align="right">Appts</TableCell>
              <TableCell align="right">Test drives</TableCell>
              <TableCell align="right">Quotes</TableCell>
              <TableCell align="right">Sold</TableCell>
              <TableCell align="right">Close rate</TableCell>
              <TableCell align="right">Revenue</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{label(r.key)}</TableCell>
                <TableCell align="right">{r.leads}</TableCell>
                <TableCell align="right">{pct(r.contacted, r.leads)}%</TableCell>
                {showResponse && <TableCell align="right">{r.avgResponse === null ? '—' : `${r.avgResponse} min`}</TableCell>}
                <TableCell align="right">{r.appointments}</TableCell>
                <TableCell align="right">{r.testDrives}</TableCell>
                <TableCell align="right">{r.quotes}</TableCell>
                <TableCell align="right">{r.sold}</TableCell>
                <TableCell align="right">{pct(r.sold, r.leads)}%</TableCell>
                <TableCell align="right">{r.revenue ? money(r.revenue) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )}
  </Paper>
);

const FunnelPage: React.FC = () => {
  const { profile, users, userName } = useMp();
  const manager = isManager(profile);
  const [period, setPeriod] = useState<PeriodId>('month');
  const [from, setFrom] = useState(() => toDateInput(Date.now() - 29 * 86_400_000));
  const [to, setTo] = useState(() => toDateInput(Date.now()));
  const [storeId, setStoreId] = useState('');
  const [ownerUid, setOwnerUid] = useState('');
  // "Now" is fixed when the page opens (keeps the query stable between renders).
  const [now] = useState(() => Date.now());
  const range = useMemo(() => periodRange(period, now, from, to), [period, now, from, to]);
  const { leads, error, loading } = useLeadsSince(range.start, manager);
  const storeOfOwner = useMemo(() => {
    const m = new Map(users.map((u) => [u.uid, u.location || '']));
    return (uid: string) => m.get(uid) || '';
  }, [users]);
  const f = useMemo(
    () => computeFunnel(leads, { start: range.start, end: range.end, storeId: storeId || undefined, ownerUid: ownerUid || undefined }, storeOfOwner),
    [leads, range, storeId, ownerUid, storeOfOwner],
  );
  const people = useMemo(() => [...users].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [users]);

  if (profile && !manager) {
    return <MpShell><Alert severity="info">The sales funnel is for managers.</Alert></MpShell>;
  }
  const max = f.total.leads;

  return (
    <MpShell>
      <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 0.5 }}>Sales funnel</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Where leads go — and where we lose them.</Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
        <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)} sx={{ minWidth: 150 }}>
          {PERIODS.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
        </TextField>
        {period === 'custom' && (
          <>
            <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </>
        )}
        <TextField select size="small" label="Store" value={storeId} onChange={(e) => setStoreId(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">All stores</MenuItem>
          {DEALERSHIPS.filter((d) => d.id !== 'T0').map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState || d.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Salesperson" value={ownerUid} onChange={(e) => setOwnerUid(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Everyone</MenuItem>
          {people.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
        </TextField>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Could not load leads: {error}</Alert>}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.25}>
          {FUNNEL_STAGES.map((st, i) => (
            <Box key={st.id}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.25 }}>
                <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>{st.label}</Typography>
                <Typography sx={{ fontWeight: 700 }}>{f.total.stages[i]}</Typography>
                {i > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92, textAlign: 'right' }}>
                    {f.stepRates[i]}% of {FUNNEL_STAGES[i - 1].label.toLowerCase()}
                  </Typography>
                )}
                {i === 0 && <Box sx={{ minWidth: 92 }} />}
              </Box>
              <Bar value={f.total.stages[i]} max={max} color={COLORS[i]} />
            </Box>
          ))}
        </Stack>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 2 }}>
          <Typography><b>{f.overallRate}%</b> of leads bought</Typography>
          <Typography><b>{money(f.total.revenue)}</b> sold</Typography>
          <Typography><b>{f.total.avgResponse === null ? '—' : `${f.total.avgResponse} min`}</b> average first reply</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          A lead that got further (for example, sold) also counts for the earlier steps.
        </Typography>
      </Paper>

      {f.biggestDrop && f.total.leads >= 3 && (
        <Alert severity="warning" icon={<TrendingDown />} sx={{ mb: 2 }}>
          Most deals are lost between <b>{f.biggestDrop.from}</b> and <b>{f.biggestDrop.to}</b> — {f.biggestDrop.lost} lead{f.biggestDrop.lost === 1 ? '' : 's'} stopped there
          ({f.biggestDrop.rate}% moved on).
        </Alert>
      )}

      <RowsTable title="By salesperson" rows={f.byPerson} label={(k) => (k ? userName(k) : 'Not assigned')} showResponse />
      <RowsTable title="By store" rows={f.byStore} label={(k) => (k ? locationName(k) : 'No store')} />
      <RowsTable title="By source" rows={f.bySource} label={sourceLabel} />
    </MpShell>
  );
};

export default FunnelPage;
