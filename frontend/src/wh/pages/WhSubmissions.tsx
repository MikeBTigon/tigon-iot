import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { limit, orderBy, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, InputAdornment, InputLabel, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { Delete, Download, ReportProblem, Search } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import StatusChip from '../components/StatusChip';
import { errText, leadName, markSpam, useDomains, useWebhooks } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { callWh, fmtTime, useWhCollection } from '../data';
import { WH } from '../types';
import type { SubmissionStatus, WhSubmission } from '../types';
import { downloadFile, stamp, submissionsCsv } from '../csv';

const STATUSES: Array<{ value: SubmissionStatus; label: string }> = [
  { value: 'queued', label: 'Queued' }, { value: 'processing', label: 'Processing' }, { value: 'done', label: 'Done' },
  { value: 'partial', label: 'Partial' }, { value: 'failed', label: 'Failed' }, { value: 'spam', label: 'Spam' },
  { value: 'duplicate', label: 'Duplicate' },
];
const PAGE = 50;
const MAX = 500;

/** Latest submissions (500) with filters, CSV export and spam marking. */
const WhSubmissions: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('');
  const [domainF, setDomainF] = useState(params.get('domain') || '');
  const [hookF, setHookF] = useState(params.get('webhook') || '');
  // One website/form selected → query just its leads (single-field equality), otherwise the latest 500.
  const { rows: raw, error } = useWhCollection<WhSubmission>(
    WH.submissions,
    hookF ? [where('webhookId', '==', hookF), limit(MAX)] : domainF ? [where('domainId', '==', domainF), limit(MAX)] : [orderBy('receivedAt', 'desc'), limit(MAX)],
    [hookF, domainF],
  );
  const rows = useMemo(() => raw && raw.slice().sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)), [raw]);
  const { rows: domains } = useDomains();
  const { rows: hooks } = useWebhooks();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const domainName = useMemo(() => new Map((domains || []).map((d) => [d.id, d.name])), [domains]);
  const hookName = useMemo(() => new Map((hooks || []).map((w) => [w.id, w.formName])), [hooks]);
  const hookOptions = useMemo(() => (hooks || []).filter((w) => !domainF || w.domainId === domainF)
    .sort((a, b) => (domainName.get(a.domainId) || '').localeCompare(domainName.get(b.domainId) || '') || a.formName.localeCompare(b.formName)), [hooks, domainF, domainName]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return (rows || []).filter((s) => {
      if (status && s.status !== status) return false;
      if (domainF && s.domainId !== domainF) return false;
      if (hookF && s.webhookId !== hookF) return false;
      if (s.receivedAt < fromMs || s.receivedAt > toMs) return false;
      if (needle) {
        const text = `${s.first_name || ''} ${s.last_name || ''} ${s.email || ''} ${s.phone1 || ''} ${s.phone2 || ''}`.toLowerCase();
        const phones = `${s.phone1 || ''}${s.phone2 || ''}`.replace(/\D/g, '');
        if (!text.includes(needle) && !(digits.length >= 3 && phones.includes(digits))) return false;
      }
      return true;
    });
  }, [rows, status, domainF, hookF, q, from, to]);

  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE) - 1));
  const pageRows = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const selRows = filtered.filter((s) => selected.has(s.id));
  const pageAll = pageRows.length > 0 && pageRows.every((s) => selected.has(s.id));

  const reset = () => setPage(0);
  const toggle = (id: string) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); };
  const togglePage = () => { const s = new Set(selected); pageRows.forEach((r) => (pageAll ? s.delete(r.id) : s.add(r.id))); setSelected(s); };

  const flag = async (spam: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      for (const s of selRows) await markSpam(s, spam, profile);
      setMsg({ ok: true, text: `${selRows.length} lead(s) marked as ${spam ? 'spam' : 'not spam'}.${spam ? '' : ' Open a lead and use "Re-run everything" to send it through its flow.'}` });
      setSelected(new Set());
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const removeSelected = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const ids = selRows.map((s) => s.id);
      let deleted = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const r = await callWh<{ deleted: number }>('whDeleteSubmissions', { submissionIds: ids.slice(i, i + 500) });
        deleted += r.deleted;
      }
      setMsg({ ok: true, text: `${deleted} lead(s) deleted.` });
      setSelected(new Set());
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((s) => s.id)));

  const exportCsv = () => {
    const list = selRows.length ? selRows : filtered;
    downloadFile(`leads-${stamp()}.csv`, submissionsCsv(list, (id) => domainName.get(id) || id, (id) => hookName.get(id) || id));
  };

  return (
    <WhShell
      title="Submissions"
      subtitle="Every lead received from your websites"
      actions={<Button variant="outlined" color="error" startIcon={<ReportProblem />} component={RouterLink} to="/wh/dead">Dead letters</Button>}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <TextField size="small" placeholder="Name, email or phone" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} sx={{ width: { xs: '100%', sm: 240 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="sb-status">Status</InputLabel>
          <Select labelId="sb-status" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
            <MenuItem value="">Any status</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="sb-domain">Website</InputLabel>
          <Select labelId="sb-domain" label="Website" value={domainF} onChange={(e) => { setDomainF(e.target.value); setHookF(''); reset(); }}>
            <MenuItem value="">All websites</MenuItem>
            {(domains || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="sb-hook">Form</InputLabel>
          <Select labelId="sb-hook" label="Form" value={hooks ? hookF : ''} onChange={(e) => { setHookF(e.target.value); reset(); }}>
            <MenuItem value="">All forms</MenuItem>
            {hookOptions.map((w) => <MenuItem key={w.id} value={w.id}>{w.formName}{domainF ? '' : ` · ${domainName.get(w.domainId) || ''}`}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" type="date" label="From" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="To" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>

      <Paper sx={{ p: 1, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ px: 1 }}>
          {rows ? <>{filtered.length} lead(s){rows.length >= MAX ? ` (from ${MAX} loaded — narrow by website or form to see older ones)` : ''}</> : 'Loading…'}
          {selRows.length > 0 && <> · <b>{selRows.length} selected</b></>}
        </Typography>
        {pageAll && selRows.length < filtered.length && (
          <Button size="small" onClick={selectAllFiltered}>Select all {filtered.length}</Button>
        )}
        {selRows.length > 0 && <Button size="small" onClick={() => setSelected(new Set())}>Clear</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" disabled={!selRows.length || busy} onClick={() => flag(true)}>Mark as spam</Button>
        <Button size="small" disabled={!selRows.length || busy} onClick={() => flag(false)}>Not spam</Button>
        <Button size="small" startIcon={<Download />} onClick={exportCsv} disabled={!filtered.length}>Export CSV{selRows.length ? ' (selected)' : ''}</Button>
        <Button size="small" color="error" startIcon={<Delete />} disabled={!selRows.length || busy} onClick={() => setConfirmDelete(true)}>
          Delete{selRows.length ? ` (${selRows.length})` : ''}
        </Button>
      </Paper>

      <Dialog open={confirmDelete} onClose={() => !busy && setConfirmDelete(false)}>
        <DialogTitle>Delete {selRows.length} lead{selRows.length === 1 ? '' : 's'}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes {selRows.length === 1 ? 'this lead' : 'these leads'} from Webhook Flows, with the step history
            and uploaded photos. It can't be undone. Tip: use <b>Export CSV</b> first if you want a copy.
            Emails already sent, rows already in Google Sheets, the DMS and MP Leads are not changed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={removeSelected} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </DialogActions>
      </Dialog>

      {rows === undefined ? <CircularProgress aria-label="Loading" /> : (
        <Paper sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={pageAll} onChange={togglePage} inputProps={{ 'aria-label': 'Select page' }} /></TableCell>
                <TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Phone</TableCell>
                <TableCell>Website</TableCell><TableCell>Form</TableCell><TableCell>Status</TableCell><TableCell>Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((s) => (
                <TableRow key={s.id} hover selected={selected.has(s.id)} sx={{ cursor: 'pointer' }} onClick={() => navigate(`/wh/submissions/${s.id}`)}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(s.id)} onChange={() => toggle(s.id)} inputProps={{ 'aria-label': `Select ${leadName(s)}` }} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{leadName(s)}{s.hasDead && <ReportProblem color="error" fontSize="inherit" sx={{ ml: 0.5, verticalAlign: 'middle' }} />}</TableCell>
                  <TableCell>{s.email || ''}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{s.phone1 || ''}</TableCell>
                  <TableCell>{domainName.get(s.domainId) || ''}</TableCell>
                  <TableCell>{hookName.get(s.webhookId) || s.form_name || ''}</TableCell>
                  <TableCell><StatusChip status={s.status} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(s.receivedAt)}</TableCell>
                </TableRow>
              ))}
              {!pageRows.length && <TableRow><TableCell colSpan={8}>{rows.length ? 'No leads match these filters.' : 'No leads yet.'}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <TablePagination component="div" count={filtered.length} page={safePage} onPageChange={(_e, p) => setPage(p)} rowsPerPage={PAGE} rowsPerPageOptions={[PAGE]} />
        </Paper>
      )}
    </WhShell>
  );
};

export default WhSubmissions;
