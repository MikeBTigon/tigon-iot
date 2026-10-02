import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, InputAdornment, InputLabel, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from '@mui/material';
import { Delete, Download, FilterAlt, FilterAltOff, Refresh, ReportProblem, Search } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import StatusChip from '../components/StatusChip';
import { errText, leadName, markSpam, useDomains, useWebhooks } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { callWh, fmtTime } from '../data';
import type { WhSubmission } from '../types';
import { downloadFile, stamp, submissionsCsv } from '../csv';
import { isDupSub, isSpamSub, loadSubmissions } from '../submissionData';

const STATUSES: Array<{ value: string; label: string }> = [
  { value: 'leads', label: 'Real leads (no spam)' },
  { value: 'queued', label: 'Queued' }, { value: 'processing', label: 'Processing' }, { value: 'done', label: 'Done' },
  { value: 'partial', label: 'Partial' }, { value: 'failed', label: 'Failed' }, { value: 'spam', label: 'Spam blocked' },
  { value: 'duplicate', label: 'Duplicate' },
];
const PAGE_SIZES = [25, 50, 100, 250];

interface Filters { q: string; status: string; domain: string; hook: string; from: string; to: string }
type SortKey = 'name' | 'email' | 'phone' | 'website' | 'form' | 'status' | 'received';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  spam: { title: 'Spam blocked', subtitle: 'Every submission that was blocked as spam' },
  duplicate: { title: 'Duplicates', subtitle: 'Every submission that was a repeat of an earlier lead' },
};

const fromMsOf = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : undefined);
const toMsOf = (d: string) => (d ? new Date(`${d}T23:59:59.999`).getTime() : undefined);

/** Every submission (paged from the server, no cap) with filters applied by the Filter button, sorting and paging. */
const WhSubmissions: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const [params, setParams] = useSearchParams();
  const fromUrl = (): Filters => ({
    q: params.get('q') || '', status: params.get('status') || '', domain: params.get('domain') || '',
    hook: params.get('webhook') || '', from: params.get('from') || '', to: params.get('to') || '',
  });
  // `draft` = what is typed/picked; `applied` = what the list shows (changes only when Filter is pressed).
  const [draft, setDraft] = useState<Filters>(fromUrl);
  const [applied, setApplied] = useState<Filters>(fromUrl);
  const [rows, setRows] = useState<WhSubmission[] | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const { rows: domains } = useDomains();
  const { rows: hooks } = useWebhooks();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'received', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Load every submission in the applied date range (all of them when no dates are set).
  useEffect(() => {
    let live = true;
    setRows(undefined);
    setLoadError('');
    loadSubmissions(fromMsOf(applied.from), toMsOf(applied.to))
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) { setRows([]); setLoadError(errText(e)); } });
    return () => { live = false; };
  }, [applied.from, applied.to, reload]);

  const domainName = useMemo(() => new Map((domains || []).map((d) => [d.id, d.name])), [domains]);
  const hookName = useMemo(() => new Map((hooks || []).map((w) => [w.id, w.formName])), [hooks]);
  const hookOptions = useMemo(() => (hooks || []).filter((w) => !draft.domain || w.domainId === draft.domain)
    .sort((a, b) => (domainName.get(a.domainId) || '').localeCompare(domainName.get(b.domainId) || '') || a.formName.localeCompare(b.formName)), [hooks, draft.domain, domainName]);

  const filtered = useMemo(() => {
    const needle = applied.q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    const list = (rows || []).filter((s) => {
      if (applied.status === 'spam') { if (!isSpamSub(s)) return false; }
      else if (applied.status === 'duplicate') { if (!isDupSub(s)) return false; }
      else if (applied.status === 'leads') { if (isSpamSub(s)) return false; }
      else if (applied.status && s.status !== applied.status) return false;
      if (applied.domain && s.domainId !== applied.domain) return false;
      if (applied.hook && s.webhookId !== applied.hook) return false;
      if (needle) {
        const text = `${s.first_name || ''} ${s.last_name || ''} ${s.email || ''} ${s.phone1 || ''} ${s.phone2 || ''}`.toLowerCase();
        const phones = `${s.phone1 || ''}${s.phone2 || ''}`.replace(/\D/g, '');
        if (!text.includes(needle) && !(digits.length >= 3 && phones.includes(digits))) return false;
      }
      return true;
    });
    const val = (s: WhSubmission): string | number => {
      switch (sort.key) {
        case 'name': return leadName(s).toLowerCase();
        case 'email': return (s.email || '').toLowerCase();
        case 'phone': return (s.phone1 || '').replace(/\D/g, '');
        case 'website': return (domainName.get(s.domainId) || '').toLowerCase();
        case 'form': return (hookName.get(s.webhookId) || s.form_name || '').toLowerCase();
        case 'status': return s.status || '';
        default: return s.receivedAt || 0;
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c * dir || (b.receivedAt || 0) - (a.receivedAt || 0);
    });
  }, [rows, applied, sort, domainName, hookName]);

  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selRows = filtered.filter((s) => selected.has(s.id));
  const pageAll = pageRows.length > 0 && pageRows.every((s) => selected.has(s.id));
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  const apply = (f: Filters = draft) => {
    setApplied(f);
    setPage(0);
    setSelected(new Set());
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.status) p.set('status', f.status);
    if (f.domain) p.set('domain', f.domain);
    if (f.hook) p.set('webhook', f.hook);
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    setParams(p, { replace: true });
  };
  const clearFilters = () => {
    const empty: Filters = { q: '', status: '', domain: '', hook: '', from: '', to: '' };
    setDraft(empty);
    apply(empty);
  };
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  const sortBy = (key: SortKey) => {
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : key === 'received' ? 'desc' : 'asc' }));
    setPage(0);
  };
  const head = (key: SortKey, label: string) => (
    <TableCell sortDirection={sort.key === key ? sort.dir : false}>
      <TableSortLabel active={sort.key === key} direction={sort.key === key ? sort.dir : 'asc'} onClick={() => sortBy(key)}>{label}</TableSortLabel>
    </TableCell>
  );

  const toggle = (id: string) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); };
  const togglePage = () => { const s = new Set(selected); pageRows.forEach((r) => (pageAll ? s.delete(r.id) : s.add(r.id))); setSelected(s); };

  const flag = async (spam: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      for (const s of selRows) await markSpam(s, spam, profile);
      const ids = new Set(selRows.map((s) => s.id));
      setRows((r) => r?.map((s) => (ids.has(s.id) ?
        { ...s, isSpam: spam, status: spam ? 'spam' : s.status === 'spam' ? 'done' : s.status } : s)));
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
    const ids = selRows.map((s) => s.id);
    const gone = new Set<string>();
    try {
      let deleted = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const r = await callWh<{ deleted: number; missing?: number }>('whDeleteSubmissions', { submissionIds: chunk });
        deleted += r.deleted;
        chunk.forEach((id) => gone.add(id));
      }
      setMsg({ ok: true, text: `${deleted} lead(s) permanently deleted.` });
      setSelected(new Set());
    } catch (e) {
      setMsg({ ok: false, text: `${gone.size ? `${gone.size} deleted, then: ` : ''}${errText(e)}` });
    } finally {
      // Deleted leads leave the list right away.
      if (gone.size) setRows((r) => r?.filter((s) => !gone.has(s.id)));
      setBusy(false);
      setConfirmDelete(false);
    }
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((s) => s.id)));

  const exportCsv = () => {
    const list = selRows.length ? selRows : filtered;
    downloadFile(`leads-${stamp()}.csv`, submissionsCsv(list, (id) => domainName.get(id) || id, (id) => hookName.get(id) || id));
  };

  const heading = TITLES[applied.status] || { title: 'Submissions', subtitle: 'Every lead received from your websites' };

  return (
    <WhShell
      title={heading.title}
      subtitle={heading.subtitle}
      actions={(
        <>
          {applied.status && <Button onClick={() => { setDraft({ ...draft, status: '' }); apply({ ...applied, status: '' }); }}>All submissions</Button>}
          <Button variant="outlined" color="error" startIcon={<ReportProblem />} component={RouterLink} to="/wh/dead">Failed steps</Button>
        </>
      )}
    >
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>Could not load the leads: {loadError}</Alert>}
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => { e.preventDefault(); apply(); }}
        sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}
      >
        <TextField size="small" placeholder="Name, email or phone" value={draft.q} onChange={(e) => set({ q: e.target.value })} sx={{ width: { xs: '100%', sm: 240 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="sb-status">Status</InputLabel>
          <Select labelId="sb-status" label="Status" value={draft.status} onChange={(e) => set({ status: e.target.value })}>
            <MenuItem value="">Any status</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="sb-domain">Website</InputLabel>
          <Select labelId="sb-domain" label="Website" value={domains ? draft.domain : ''} onChange={(e) => set({ domain: e.target.value, hook: '' })}>
            <MenuItem value="">All websites</MenuItem>
            {(domains || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="sb-hook">Form</InputLabel>
          <Select labelId="sb-hook" label="Form" value={hooks ? draft.hook : ''} onChange={(e) => set({ hook: e.target.value })}>
            <MenuItem value="">All forms</MenuItem>
            {hookOptions.map((w) => <MenuItem key={w.id} value={w.id}>{w.formName}{draft.domain ? '' : ` · ${domainName.get(w.domainId) || ''}`}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" type="date" label="From" value={draft.from} onChange={(e) => set({ from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="To" value={draft.to} onChange={(e) => set({ to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <Button type="submit" variant="contained" startIcon={<FilterAlt />} color={dirty ? 'primary' : 'inherit'}>Filter</Button>
        <Button startIcon={<FilterAltOff />} onClick={clearFilters}>Clear</Button>
        <Button startIcon={<Refresh />} onClick={() => setReload((n) => n + 1)} disabled={rows === undefined}>Refresh</Button>
        {dirty && <Typography variant="caption" color="primary">Press Filter to apply</Typography>}
      </Box>

      <Paper sx={{ p: 1, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ px: 1 }}>
          {rows ? <><b>{filtered.length}</b> {applied.status === 'spam' ? 'blocked' : applied.status === 'duplicate' ? 'duplicate' : ''} submission(s)</> : 'Loading every submission…'}
          {selRows.length > 0 && <> · <b>{selRows.length} selected</b></>}
        </Typography>
        {pageAll && selRows.length < filtered.length && (
          <Button size="small" onClick={selectAllFiltered}>Select all {filtered.length}</Button>
        )}
        {selRows.length > 0 && <Button size="small" onClick={() => setSelected(new Set())}>Clear selection</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" disabled={!selRows.length || busy} onClick={() => flag(true)}>Mark as spam</Button>
        <Button size="small" disabled={!selRows.length || busy} onClick={() => flag(false)}>Not spam</Button>
        <Button size="small" startIcon={<Download />} onClick={exportCsv} disabled={!filtered.length}>Export CSV{selRows.length ? ' (selected)' : ''}</Button>
        <Button size="small" color="error" variant={selRows.length ? 'contained' : 'text'} startIcon={<Delete />} disabled={!selRows.length || busy} onClick={() => setConfirmDelete(true)}>
          Delete{selRows.length ? ` (${selRows.length})` : ''}
        </Button>
      </Paper>

      <Dialog open={confirmDelete} onClose={() => !busy && setConfirmDelete(false)}>
        <DialogTitle>Delete {selRows.length} lead{selRows.length === 1 ? '' : 's'}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes {selRows.length === 1 ? 'this lead' : 'these leads'} from Webhook Flows, with the step history
            and uploaded photos, and takes {selRows.length === 1 ? 'it' : 'them'} out of the overview counts. It can't be undone.
            Tip: use <b>Export CSV</b> first if you want a copy.
            Emails already sent, rows already in Google Sheets, the DMS and MP Leads are not changed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={removeSelected} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </DialogActions>
      </Dialog>

      {rows === undefined ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box> : (
        <Paper sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={pageAll} onChange={togglePage} inputProps={{ 'aria-label': 'Select page' }} /></TableCell>
                {head('name', 'Name')}{head('email', 'Email')}{head('phone', 'Phone')}
                {head('website', 'Website')}{head('form', 'Form')}{head('status', 'Status')}{head('received', 'Received')}
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
                  <TableCell>
                    <StatusChip status={s.status} />
                    {s.status === 'spam' && s.spamReason && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{s.spamReason}</Typography>}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(s.receivedAt)}</TableCell>
                </TableRow>
              ))}
              {!pageRows.length && <TableRow><TableCell colSpan={8}>{rows.length ? 'No submissions match these filters.' : 'No submissions in this date range.'}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={filtered.length}
            page={safePage}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={pageSize}
            rowsPerPageOptions={PAGE_SIZES}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            showFirstButton
            showLastButton
          />
        </Paper>
      )}
    </WhShell>
  );
};

export default WhSubmissions;
