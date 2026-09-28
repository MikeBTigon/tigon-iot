import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { Add, AccountTree, ContentCopy, Delete, Edit, LibraryAdd, Star } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import Wh2CloneDialog from '../components/Wh2CloneDialog';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { removeWh, saveWh, useWhCollection, useWhDoc, fmtTime } from '../data';
import { ensureWhDefaults } from '../bootstrap';
import { STEP_META, newStep } from '../steps';
import { WH } from '../types';
import type { WhDomain, WhFlow, WhGlobalSettings, WhWebhook } from '../types';

const StepChips: React.FC<{ flow: WhFlow }> = ({ flow }) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
    {(flow.steps || []).filter((s) => s.enabled !== false).map((s, i) => (
      <Chip key={s.id} size="small" variant="outlined" icon={<Box component="span" sx={{ display: 'flex', pl: 0.5 }}>{STEP_META[s.type]?.icon}</Box>}
        label={`${i + 1}. ${s.name || STEP_META[s.type]?.label || s.type}`} />
    ))}
    {!(flow.steps || []).length && <Typography variant="caption" color="text.secondary">No steps yet</Typography>}
  </Box>
);

const WhFlows: React.FC = () => {
  const { profile, isAdmin } = useMp();
  const navigate = useNavigate();
  const { rows: flows, error } = useWhCollection<WhFlow>(WH.flows);
  const { rows: webhooks } = useWhCollection<WhWebhook>(WH.webhooks);
  const { rows: domains } = useWhCollection<WhDomain>(WH.domains);
  const global = useWhDoc<WhGlobalSettings & { id: string }>(WH.settings, 'global');
  const [clone, setClone] = useState<{ flow: WhFlow; mode: 'clone' | 'template' } | null>(null);
  const [del, setDel] = useState<WhFlow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const usage = useMemo(() => {
    const m = new Map<string, WhWebhook[]>();
    for (const w of webhooks || []) m.set(w.flowId, [...(m.get(w.flowId) || []), w]);
    return m;
  }, [webhooks]);
  const domainName = (id: string) => (domains || []).find((d) => d.id === id)?.name || 'Unknown website';

  const masterId = global?.masterFlowId;
  const master = (flows || []).find((f) => (masterId ? f.id === masterId : f.type === 'master'));
  const templates = (flows || []).filter((f) => f.type === 'template').sort((a, b) => a.name.localeCompare(b.name));
  const privates = (flows || []).filter((f) => f.type === 'webhook').sort((a, b) => a.name.localeCompare(b.name));
  const missingDefaults = global === null || (flows !== undefined && !master);

  const setup = async () => {
    if (!profile) return;
    setBusy(true);
    setMsg('');
    try {
      await ensureWhDefaults(profile);
      setMsg('Webhook Flows is set up: Master Flow, "Standard lead flow" and default email templates were created.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const newTemplate = async () => {
    setBusy(true);
    try {
      const id = await saveWh(WH.flows, {
        name: 'New template flow', type: 'template', forwardToMaster: true, settings: {},
        steps: [newStep('validate'), newStep('dedupe'), newStep('email'), newStep('sheets')],
      });
      await writeAudit(profile, 'wh_flow_create', `wh_flows/${id}`, 'New template flow');
      navigate(`/wh/flows/${id}`);
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };

  const doDelete = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await removeWh(WH.flows, del.id);
      await writeAudit(profile, 'wh_flow_delete', `wh_flows/${del.id}`, del.name);
      setDel(null);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const deleteBlock = (f: WhFlow): string => {
    if (f.type === 'master' || f.id === masterId) return 'The Master Flow can\'t be deleted';
    if (f.id === global?.defaultFlowId) return 'This is the default flow for new websites (change it in Settings first)';
    const n = usage.get(f.id)?.length || 0;
    if (n) return `In use by ${n} webhook${n === 1 ? '' : 's'} — switch them to another flow first`;
    return '';
  };

  const card = (f: WhFlow, extra?: React.ReactNode) => {
    const used = usage.get(f.id) || [];
    const block = deleteBlock(f);
    const isMaster = f.type === 'master';
    return (
      <Paper key={f.id} variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ flexGrow: 1, minWidth: 200 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography component={RouterLink} to={`/wh/flows/${f.id}`} sx={{ fontWeight: 600, color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                {f.name}
              </Typography>
              {f.id === global?.defaultFlowId && <Chip size="small" color="primary" icon={<Star />} label="Default for new websites" />}
              {!isMaster && !f.forwardToMaster && !(f.steps || []).some((s) => s.type === 'forward_to_master') && (
                <Chip size="small" color="warning" variant="outlined" label="Skips Master Flow" />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {(f.steps || []).length} step{(f.steps || []).length === 1 ? '' : 's'}
              {!isMaster && ` · used by ${used.length} webhook${used.length === 1 ? '' : 's'}`}
              {f.type === 'webhook' && used.length === 1 && ` (${domainName(used[0].domainId)} — ${used[0].formName})`}
              {` · updated ${fmtTime(f.updatedAt)}`}
            </Typography>
            {extra}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={isMaster && !isAdmin ? 'View (admins edit)' : 'Edit'}>
              <IconButton aria-label="Edit" onClick={() => navigate(`/wh/flows/${f.id}`)}><Edit /></IconButton>
            </Tooltip>
            <Tooltip title="Clone">
              <IconButton aria-label="Clone" onClick={() => setClone({ flow: f, mode: 'clone' })}><ContentCopy /></IconButton>
            </Tooltip>
            {f.type === 'webhook' && (
              <Tooltip title="Save as template">
                <IconButton aria-label="Save as template" onClick={() => setClone({ flow: f, mode: 'template' })}><LibraryAdd /></IconButton>
              </Tooltip>
            )}
            {!isMaster && (
              <Tooltip title={block || 'Delete'}>
                <span><IconButton aria-label="Delete" disabled={!!block} onClick={() => setDel(f)}><Delete /></IconButton></span>
              </Tooltip>
            )}
          </Box>
        </Box>
        <StepChips flow={f} />
      </Paper>
    );
  };

  const loading = flows === undefined || global === undefined;

  return (
    <WhShell
      title="Flows"
      subtitle="A flow is the list of steps each lead goes through: checks, emails, sheets, DMS and more."
      actions={<Button variant="contained" startIcon={<Add />} onClick={newTemplate} disabled={busy}>New template flow</Button>}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {msg && <Alert severity={msg.startsWith('Webhook Flows is set up') ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg('')}>{msg}</Alert>}
      {loading && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>}
      {!loading && missingDefaults && (
        <Alert severity="info" sx={{ mb: 2 }} action={isAdmin ? <Button color="inherit" onClick={setup} disabled={busy}>Set up Webhook Flows</Button> : undefined}>
          Webhook Flows isn&apos;t set up yet. {isAdmin ?
            'One click creates the Master Flow, a "Standard lead flow" template, default email templates and global settings.' :
            'Ask an admin to open this page and click "Set up Webhook Flows".'}
        </Alert>
      )}
      {!loading && (
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AccountTree fontSize="small" /> Master Flow</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Every lead from every website passes through here after its own flow: duplicates across sites, DMS, the master sheet, CRM lead and notifications.
              {!isAdmin && ' Only admins can change it.'}
            </Typography>
            {master ? card(master) : <Typography color="text.secondary">No Master Flow yet.</Typography>}
          </Box>
          <Box>
            <Typography variant="h6">Template flows</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Shared flows: change one and every webhook using it changes too. Best for most websites.
            </Typography>
            <Stack spacing={1.5}>
              {templates.map((f) => card(f))}
              {!templates.length && <Typography color="text.secondary">No template flows yet — click &quot;New template flow&quot;.</Typography>}
            </Stack>
          </Box>
          <Box>
            <Typography variant="h6">Website flows</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Private copies used by a single webhook, for websites that need something special. Create one with &quot;Clone&quot;.
            </Typography>
            <Stack spacing={1.5}>
              {privates.map((f) => card(f))}
              {!privates.length && <Typography color="text.secondary">No website flows. Most webhooks use a template flow.</Typography>}
            </Stack>
          </Box>
        </Stack>
      )}

      {clone && (
        <Wh2CloneDialog key={`${clone.flow.id}:${clone.mode}`} flow={clone.flow} mode={clone.mode}
          webhooks={webhooks || []} domains={domains || []} onClose={() => setClone(null)} />
      )}
      <Dialog open={!!del} onClose={() => !busy && setDel(null)}>
        <DialogTitle>Delete flow?</DialogTitle>
        <DialogContent>
          <DialogContentText>&quot;{del?.name}&quot; will be deleted. No webhook uses it. This can&apos;t be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDel(null)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete} disabled={busy}>Delete</Button>
        </DialogActions>
      </Dialog>
    </WhShell>
  );
};

export default WhFlows;
