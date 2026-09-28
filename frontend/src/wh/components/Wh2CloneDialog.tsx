import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { patchWh, saveWh } from '../data';
import { WH } from '../types';
import type { WhDomain, WhFlow, WhWebhook } from '../types';

/**
 * Copy a flow. mode 'template' = "Save as template" (always a shared template);
 * mode 'clone' = new template, or a private copy assigned to one webhook.
 */
const Wh2CloneDialog: React.FC<{
  flow: WhFlow | null;
  mode: 'clone' | 'template';
  webhooks: WhWebhook[];
  domains: WhDomain[];
  onClose: () => void;
}> = ({ flow, mode, webhooks, domains, onClose }) => {
  const { profile } = useMp();
  const navigate = useNavigate();
  // Parents render this with key={flow?.id + mode}, so the initial state below is per flow.
  const [name, setName] = useState(() => (!flow ? '' : mode === 'template' ? `${flow.name} (template)` : `Copy of ${flow.name}`));
  const [kind, setKind] = useState<'template' | 'webhook'>('template');
  const [webhookId, setWebhookId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const domainName = (id: string) => domains.find((d) => d.id === id)?.name || 'Unknown website';
  const hookLabel = (w: WhWebhook) => `${domainName(w.domainId)} — ${w.formName || w.id}`;

  const go = async () => {
    if (!flow) return;
    if (!name.trim()) { setError('Give the new flow a name.'); return; }
    if (mode === 'clone' && kind === 'webhook' && !webhookId) { setError('Pick the webhook that gets this private copy.'); return; }
    setBusy(true);
    setError('');
    try {
      const type: WhFlow['type'] = mode === 'clone' && kind === 'webhook' ? 'webhook' : 'template';
      const id = await saveWh(WH.flows, {
        name: name.trim(),
        type,
        steps: flow.steps || [],
        settings: flow.settings || {},
        forwardToMaster: flow.type === 'master' ? true : flow.forwardToMaster !== false,
      });
      if (type === 'webhook') await patchWh(WH.webhooks, webhookId, { flowId: id });
      await writeAudit(profile, mode === 'template' ? 'wh_flow_save_template' : 'wh_flow_clone', `wh_flows/${id}`,
        `From "${flow.name}" (${flow.id})${type === 'webhook' ? `, assigned to webhook ${webhookId}` : ''}`);
      onClose();
      navigate(`/wh/flows/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!flow} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'template' ? 'Save as template' : 'Clone flow'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {mode === 'template' ?
              'Creates a shared template flow with the same steps and settings. Other webhooks can then use it.' :
              'Creates a copy with the same steps and settings. Changes to the copy don\'t affect the original.'}
          </Typography>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
          {mode === 'clone' && (
            <TextField select label="The copy is…" value={kind} onChange={(e) => setKind(e.target.value as 'template' | 'webhook')}>
              <MenuItem value="template">A template flow (can be shared by many webhooks)</MenuItem>
              <MenuItem value="webhook">A private flow for one webhook</MenuItem>
            </TextField>
          )}
          {mode === 'clone' && kind === 'webhook' && (
            <TextField select label="Webhook" value={webhookId} onChange={(e) => setWebhookId(e.target.value)}
              helperText="This webhook switches to the new private flow.">
              {webhooks.length === 0 && <MenuItem value="" disabled>No webhooks yet</MenuItem>}
              {[...webhooks].sort((a, b) => hookLabel(a).localeCompare(hookLabel(b))).map((w) => (
                <MenuItem key={w.id} value={w.id}>{hookLabel(w)}</MenuItem>
              ))}
            </TextField>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={go} disabled={busy}>{mode === 'template' ? 'Save as template' : 'Clone'}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default Wh2CloneDialog;
