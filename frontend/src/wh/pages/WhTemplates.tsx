import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton,
  Link, Paper, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { Add, ContentCopy, Delete, Edit } from '@mui/icons-material';
import { db } from '../../config/firebase';
import WhShell from '../components/WhShell';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { fmtTime, removeWh, saveWh, useWhCollection } from '../data';
import { WH } from '../types';
import type { WhEmailTemplate, WhSettings } from '../types';

/** Where a template is referenced (best effort: global, flows, websites, webhooks, email steps). */
async function findReferences(templateId: string): Promise<string[]> {
  const refs: string[] = [];
  const uses = (s: WhSettings | undefined) => !!s && (s.emailTemplateId === templateId || s.autoReplyTemplateId === templateId);
  const [settings, flows, domains, hooks] = await Promise.all([
    getDocs(collection(db, WH.settings)), getDocs(collection(db, WH.flows)),
    getDocs(collection(db, WH.domains)), getDocs(collection(db, WH.webhooks)),
  ]);
  settings.forEach((d) => { if (uses(d.data() as WhSettings)) refs.push('Global settings'); });
  flows.forEach((d) => {
    const f = d.data();
    if (uses(f.settings)) refs.push(`Flow "${f.name}" settings`);
    for (const s of f.steps || []) if (s?.type === 'email' && s.config?.templateId === templateId) refs.push(`Flow "${f.name}" → ${s.name || 'Send email'}`);
  });
  domains.forEach((d) => { if (uses(d.data().settings)) refs.push(`Website "${d.data().name}"`); });
  hooks.forEach((d) => { if (uses(d.data().settings)) refs.push(`Webhook "${d.data().formName || d.id}"`); });
  return refs;
}

const WhTemplates: React.FC = () => {
  const { profile } = useMp();
  const navigate = useNavigate();
  const { rows, error } = useWhCollection<WhEmailTemplate>(WH.templates);
  const [del, setDel] = useState<{ t: WhEmailTemplate; refs: string[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const sorted = [...(rows || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const duplicate = async (t: WhEmailTemplate) => {
    setBusy(true);
    try {
      const id = await saveWh(WH.templates, { name: `Copy of ${t.name}`, subject: t.subject, htmlBody: t.htmlBody, textBody: t.textBody });
      await writeAudit(profile, 'wh_template_duplicate', `wh_email_templates/${id}`, `From ${t.name}`);
      navigate(`/wh/templates/${id}`);
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };

  const askDelete = async (t: WhEmailTemplate) => {
    setDel({ t, refs: null });
    try { setDel({ t, refs: await findReferences(t.id) }); } catch { setDel({ t, refs: [] }); }
  };

  const doDelete = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await removeWh(WH.templates, del.t.id);
      await writeAudit(profile, 'wh_template_delete', `wh_email_templates/${del.t.id}`, del.t.name);
      setDel(null);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <WhShell
      title="Email templates"
      subtitle="The design and wording of lead emails. Use merge tags like {{first_name}} to fill in lead details."
      actions={<Button variant="contained" startIcon={<Add />} onClick={() => navigate('/wh/templates/new')}>New template</Button>}
    >
      {(error || msg) && <Alert severity="error" sx={{ mb: 2 }}>{error || msg}</Alert>}
      {rows === undefined ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box> : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Subject</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/wh/templates/${t.id}`} sx={{ fontWeight: 600 }}>{t.name || '(untitled)'}</Link>
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>{t.subject}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, maxWidth: 360, wordBreak: 'break-word' }}>{t.subject}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>{fmtTime(t.updatedAt)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit"><IconButton size="small" aria-label="Edit" onClick={() => navigate(`/wh/templates/${t.id}`)}><Edit fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Duplicate"><span><IconButton size="small" aria-label="Duplicate" disabled={busy} onClick={() => duplicate(t)}><ContentCopy fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" aria-label="Delete" onClick={() => askDelete(t)}><Delete fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!sorted.length && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    No email templates yet. Click &quot;New template&quot;, or ask an admin to run &quot;Set up Webhook Flows&quot; (Flows page) to get a ready-made one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={!!del} onClose={() => !busy && setDel(null)} fullWidth maxWidth="sm">
        <DialogTitle>Delete template?</DialogTitle>
        <DialogContent>
          {del?.refs === null && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><CircularProgress size={18} /> Checking where it&apos;s used…</Box>}
          {!!del?.refs?.length && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              &quot;{del.t.name}&quot; is still used by:
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{del.refs.slice(0, 15).map((r, i) => <li key={i}>{r}</li>)}</ul>
              {del.refs.length > 15 && `…and ${del.refs.length - 15} more. `}
              If you delete it, those emails fall back to the global template (or aren&apos;t sent if none is set).
            </Alert>
          )}
          {del?.refs && !del.refs.length && <DialogContentText>&quot;{del.t.name}&quot; isn&apos;t used anywhere. This can&apos;t be undone.</DialogContentText>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDel(null)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete} disabled={busy || del?.refs === null}>
            {del?.refs?.length ? 'Delete anyway' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </WhShell>
  );
};

export default WhTemplates;
