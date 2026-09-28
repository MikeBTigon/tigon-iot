import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { doc, writeBatch } from 'firebase/firestore';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  FormControlLabel, InputAdornment, InputLabel, MenuItem, Paper, Radio, RadioGroup, Select, Table, TableBody, TableCell,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, Download, Search } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import StatusChip from '../components/StatusChip';
import { ago, errText, useDomains, useFlows, useNow, useWebhooks } from '../components/Wh1Hooks';
import { db } from '../../config/firebase';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { splitList } from '../data';
import { randomKey } from '../shared';
import { WH } from '../types';
import type { WhWebhook } from '../types';
import { downloadFile, stamp, webhooksCsv } from '../csv';
import { extractSheetId } from '../websites';

const PAGE = 50;
const CHUNK = 400;

type BulkKind = 'flow' | 'emails' | 'sheet' | 'rekey' | null;

/** Apply `update(row)` to every row with batched writes (400 per batch). */
async function bulkWrite(rows: WhWebhook[], update: (w: WhWebhook) => Record<string, unknown>) {
  const now = Date.now();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of rows.slice(i, i + CHUNK)) batch.update(doc(db, WH.webhooks, w.id), { ...update(w), updatedAt: now });
    await batch.commit();
  }
}

/** All webhooks: search, filters, pagination and bulk actions. */
const WhWebhooks: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const now = useNow();
  const { rows: hooks, error } = useWebhooks();
  const { rows: domains } = useDomains();
  const { rows: flows } = useFlows();

  const [q, setQ] = useState('');
  const [domainF, setDomainF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [flowF, setFlowF] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkKind>(null);
  const [bulkFlow, setBulkFlow] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [emailMode, setEmailMode] = useState<'add' | 'replace'>('add');
  const [bulkSheet, setBulkSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const domainName = useMemo(() => new Map((domains || []).map((d) => [d.id, d.name])), [domains]);
  const flowName = useMemo(() => new Map((flows || []).map((f) => [f.id, f.name])), [flows]);
  const assignable = useMemo(() => (flows || []).filter((f) => f.type !== 'master').sort((a, b) => a.name.localeCompare(b.name)), [flows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (hooks || [])
      .filter((w) => (!domainF || w.domainId === domainF) && (!statusF || w.status === statusF) && (!flowF || w.flowId === flowF))
      .filter((w) => !needle || `${w.formName} ${domainName.get(w.domainId) || ''} ${w.key} ${w.id}`.toLowerCase().includes(needle))
      .sort((a, b) => (domainName.get(a.domainId) || '').localeCompare(domainName.get(b.domainId) || '') || a.formName.localeCompare(b.formName));
  }, [hooks, q, domainF, statusF, flowF, domainName]);

  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE) - 1));
  const pageRows = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const selRows = filtered.filter((w) => selected.has(w.id));
  const allFilteredSelected = filtered.length > 0 && selRows.length === filtered.length;
  const pageAllSelected = pageRows.length > 0 && pageRows.every((w) => selected.has(w.id));

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };
  const togglePage = () => {
    const s = new Set(selected);
    if (pageAllSelected) pageRows.forEach((w) => s.delete(w.id)); else pageRows.forEach((w) => s.add(w.id));
    setSelected(s);
  };

  const run = async (label: string, action: string, update: (w: WhWebhook) => Record<string, unknown>, details = '') => {
    const rows = selRows;
    if (!rows.length) return;
    setBusy(true);
    setMsg(null);
    try {
      await bulkWrite(rows, update);
      await writeAudit(profile, action, `${rows.length} webhook(s)`, `${details}${details ? ' · ' : ''}${rows.slice(0, 50).map((w) => w.id).join(',')}${rows.length > 50 ? '…' : ''}`);
      setMsg({ ok: true, text: `${label}: ${rows.length} webhook(s) updated.` });
      setBulk(null);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const applyBulk = () => {
    if (bulk === 'flow') {
      if (!bulkFlow) return;
      run('Flow assigned', 'wh_bulk_assign_flow', () => ({ flowId: bulkFlow }), `flow ${bulkFlow}`);
    } else if (bulk === 'emails') {
      const list = splitList(bulkEmails);
      run(emailMode === 'add' ? 'Recipients added' : 'Recipients replaced', 'wh_bulk_email_to', (w) => ({
        'settings.emailTo': emailMode === 'add' ? Array.from(new Set([...(w.settings?.emailTo || []), ...list])) : list,
      }), `${emailMode}: ${list.join(', ')}`);
    } else if (bulk === 'sheet') {
      const id = extractSheetId(bulkSheet);
      run('Google Sheet set', 'wh_bulk_sheet', () => ({ 'settings.sheetId': id }), `sheet ${id || '(cleared)'}`);
    } else if (bulk === 'rekey') {
      run('New addresses created', 'wh_bulk_rekey', () => ({ key: randomKey(32) }));
    }
  };

  const exportCsv = () => {
    const rows = selRows.length ? selRows : filtered;
    downloadFile(`webhooks-${stamp()}.csv`, webhooksCsv(rows, (id) => domainName.get(id) || id, (id) => flowName.get(id) || id));
  };

  const n = selRows.length;

  return (
    <WhShell
      title="Webhooks"
      subtitle="Every form on every website has its own webhook address"
      actions={<Button variant="contained" startIcon={<Add />} component={RouterLink} to="/wh/new">Add website</Button>}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <TextField size="small" placeholder="Search form, website or key" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
          sx={{ width: { xs: '100%', sm: 280 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="whk-d">Website</InputLabel>
          <Select labelId="whk-d" label="Website" value={domainF} onChange={(e) => { setDomainF(e.target.value); setPage(0); }}>
            <MenuItem value="">All websites</MenuItem>
            {(domains || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel id="whk-s">Status</InputLabel>
          <Select labelId="whk-s" label="Status" value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(0); }}>
            <MenuItem value="">Any status</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="whk-f">Flow</InputLabel>
          <Select labelId="whk-f" label="Flow" value={flowF} onChange={(e) => { setFlowF(e.target.value); setPage(0); }}>
            <MenuItem value="">Any flow</MenuItem>
            {assignable.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Paper sx={{ p: 1, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ px: 1 }}>
          {n ? <b>{n} selected</b> : 'Select webhooks for bulk actions'}
          {n > 0 && !allFilteredSelected && filtered.length > PAGE && (
            <Button size="small" onClick={() => setSelected(new Set(filtered.map((w) => w.id)))}>Select all {filtered.length}</Button>
          )}
          {n > 0 && <Button size="small" onClick={() => setSelected(new Set())}>Clear</Button>}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" disabled={!n || busy} onClick={() => run('Paused', 'wh_bulk_pause', () => ({ status: 'paused' }))}>Pause</Button>
        <Button size="small" disabled={!n || busy} onClick={() => run('Activated', 'wh_bulk_activate', () => ({ status: 'active' }))}>Activate</Button>
        <Button size="small" disabled={!n || busy} onClick={() => { setBulkFlow(''); setBulk('flow'); }}>Assign flow</Button>
        <Button size="small" disabled={!n || busy} onClick={() => { setBulkEmails(''); setBulk('emails'); }}>Set recipients</Button>
        <Button size="small" disabled={!n || busy} onClick={() => { setBulkSheet(''); setBulk('sheet'); }}>Set Google Sheet</Button>
        <Button size="small" color="error" disabled={!n || busy} onClick={() => setBulk('rekey')}>New addresses</Button>
        <Button size="small" startIcon={<Download />} onClick={exportCsv} disabled={!filtered.length}>Export CSV{n ? ' (selected)' : ''}</Button>
      </Paper>

      {hooks === undefined ? <CircularProgress aria-label="Loading" /> : (
        <Paper sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={pageAllSelected} indeterminate={!pageAllSelected && pageRows.some((w) => selected.has(w.id))} onChange={togglePage} inputProps={{ 'aria-label': 'Select page' }} /></TableCell>
                <TableCell>Form</TableCell>
                <TableCell>Website</TableCell>
                <TableCell>Flow</TableCell>
                <TableCell>Recipients</TableCell>
                <TableCell>Last lead</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((w) => (
                <TableRow key={w.id} hover selected={selected.has(w.id)} sx={{ cursor: 'pointer' }} onClick={() => navigate(`/wh/webhooks/${w.id}`)}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(w.id)} onChange={() => toggle(w.id)} inputProps={{ 'aria-label': `Select ${w.formName}` }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{w.formName}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{w.key.slice(0, 8)}…{w.hmacRequired ? ' · signed' : ''}</Typography>
                  </TableCell>
                  <TableCell>{domainName.get(w.domainId) || '(deleted website)'}</TableCell>
                  <TableCell>{flowName.get(w.flowId) || '(missing flow)'}</TableCell>
                  <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(w.settings?.emailTo || []).join(', ') || <Typography variant="caption" color="text.secondary">inherited</Typography>}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{ago(w.lastReceivedAt, now)}</TableCell>
                  <TableCell><StatusChip status={w.status} /></TableCell>
                </TableRow>
              ))}
              {!pageRows.length && <TableRow><TableCell colSpan={7}>{hooks.length ? 'No webhooks match these filters.' : 'No webhooks yet — add a website to create one.'}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={filtered.length} page={safePage} onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={PAGE} rowsPerPageOptions={[PAGE]}
          />
        </Paper>
      )}

      <Dialog open={!!bulk} onClose={() => !busy && setBulk(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {bulk === 'flow' && `Assign a flow to ${n} webhook(s)`}
          {bulk === 'emails' && `Set email recipients for ${n} webhook(s)`}
          {bulk === 'sheet' && `Set the Google Sheet for ${n} webhook(s)`}
          {bulk === 'rekey' && `Create new addresses for ${n} webhook(s)?`}
        </DialogTitle>
        <DialogContent>
          {bulk === 'flow' && (
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel id="bulk-flow">Flow</InputLabel>
              <Select labelId="bulk-flow" label="Flow" value={bulkFlow} onChange={(e) => setBulkFlow(e.target.value)}>
                {assignable.map((f) => <MenuItem key={f.id} value={f.id}>{f.name} {f.type === 'template' ? '(shared)' : '(private)'}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          {bulk === 'emails' && (
            <>
              <RadioGroup row value={emailMode} onChange={(e) => setEmailMode(e.target.value as 'add' | 'replace')}>
                <FormControlLabel value="add" control={<Radio />} label="Add to the current recipients" />
                <FormControlLabel value="replace" control={<Radio />} label="Replace them" />
              </RadioGroup>
              <TextField fullWidth sx={{ mt: 1 }} label="Email addresses" placeholder="sales@example.com, manager@example.com" value={bulkEmails} onChange={(e) => setBulkEmails(e.target.value)}
                helperText={emailMode === 'replace' ? 'Leave empty to clear them (the website / global recipients are used).' : 'Separate several with commas.'} />
            </>
          )}
          {bulk === 'sheet' && (
            <TextField fullWidth sx={{ mt: 1 }} label="Google Sheet link or id" value={bulkSheet} onChange={(e) => setBulkSheet(e.target.value)}
              helperText="Leave empty to clear it (the website / global sheet is used). Share the sheet with the service account (see Settings)." />
          )}
          {bulk === 'rekey' && (
            <Alert severity="error">
              Each selected webhook gets a new random address. <b>The old addresses stop working immediately</b> — every website form
              using them must be updated with the new code, or leads will be lost. Only do this if an address was leaked or abused.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulk(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color={bulk === 'rekey' ? 'error' : 'primary'} onClick={applyBulk}
            disabled={busy || (bulk === 'flow' && !bulkFlow) || (bulk === 'emails' && emailMode === 'add' && !splitList(bulkEmails).length)}>
            {busy ? 'Working…' : bulk === 'rekey' ? 'Create new addresses' : 'Apply'}
          </Button>
        </DialogActions>
      </Dialog>
    </WhShell>
  );
};

export default WhWebhooks;
