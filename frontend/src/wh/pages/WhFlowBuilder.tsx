import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { where } from 'firebase/firestore';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress, Divider, FormControlLabel,
  Link, List, ListItem, ListItemText, Menu, MenuItem, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { Add, ArrowBack, ContentCopy, ExpandMore, LibraryAdd, PlayArrow, Save } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import SettingsForm from '../components/SettingsForm';
import StepCard from '../components/StepCard';
import type { StepCtx } from '../components/StepCard';
import Wh2CloneDialog from '../components/Wh2CloneDialog';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { callWh, saveWh, useWhCollection, useWhDoc } from '../data';
import { resolveSettings } from '../shared';
import { STEP_META, STEP_TYPES, newStep, newStepId } from '../steps';
import { WH } from '../types';
import type {
  FlowStep, StepType, WhDomain, WhEmailTemplate, WhFlow, WhGlobalSettings, WhIntegration, WhSettings, WhWebhook,
} from '../types';

const TYPE_LABEL: Record<WhFlow['type'], string> = { master: 'Master Flow', template: 'Template flow', webhook: 'Website flow' };

/** Problems that block saving, keyed by step id ('' = flow-level). */
function validateFlow(flow: WhFlow): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!flow.name?.trim()) errs[''] = 'Give the flow a name.';
  const steps = flow.steps || [];
  steps.forEach((s, i) => {
    const c = s.config || {};
    if (s.type === 'condition') {
      if (!c.field) errs[s.id] = 'Pick the field to check.';
      for (const k of ['then', 'else'] as const) {
        const t = String(c[k] || 'continue');
        if (t === 'continue' || t === 'stop') continue;
        const j = steps.findIndex((x) => x.id === t);
        if (j < 0) errs[s.id] = `The "${k === 'then' ? 'If true' : 'Otherwise'}" step no longer exists — pick another.`;
        else if (j <= i) errs[s.id] = 'Jumps must go to a later step (move the target step below this one).';
      }
    }
    if (s.type === 'webhook_out' && !/^https:\/\/[^\s/]+\.[^\s]+/i.test(String(c.url || ''))) errs[s.id] = 'Enter a URL starting with https://';
    if (s.type === 'delay') {
      const m = Number(c.minutes);
      if (!Number.isInteger(m) || m < 1 || m > 10080) errs[s.id] = 'Wait between 1 and 10080 minutes (7 days).';
    }
    if (s.type === 'sheets' && c.spreadsheetId !== undefined && c.spreadsheetId !== 'inherit' && !String(c.spreadsheetId).trim()) {
      errs[s.id] = 'Paste the sheet link, or choose "The sheet from settings".';
    }
  });
  return errs;
}

const stepTitle = (s: FlowStep) => s.name || STEP_META[s.type]?.label || s.type;

/** Plain-English summary of what happens to a lead. */
const Preview: React.FC<{ flow: WhFlow; master: WhFlow | null | undefined }> = ({ flow, master }) => {
  const on = (f: WhFlow) => (f.steps || []).filter((s) => s.enabled !== false);
  const list = (f: WhFlow) => on(f).map((s, i) => `${i + 1}. ${stepTitle(s)}`).join(' → ') || '(no steps yet)';
  const isMaster = flow.type === 'master';
  const toMaster = !isMaster && (flow.forwardToMaster || (flow.steps || []).some((s) => s.type === 'forward_to_master' && s.enabled !== false));
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
      <Typography variant="body2">
        <b>{isMaster ? 'After each website\'s own flow:' : 'When a form is submitted:'}</b> {list(flow)}
        {!isMaster && (toMaster ?
          <> → <b>then the Master Flow:</b> {master ? list(master) : '(not set up yet)'}</> :
          <> — <b>the Master Flow is skipped.</b></>)}
      </Typography>
    </Paper>
  );
};

const WhFlowBuilder: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, isAdmin, users } = useMp();
  const flow = useWhDoc<WhFlow>(WH.flows, id);
  const global = useWhDoc<WhGlobalSettings & { id: string }>(WH.settings, 'global');
  const master = useWhDoc<WhFlow>(WH.flows, global?.masterFlowId || 'master');
  const { rows: usedBy } = useWhCollection<WhWebhook>(WH.webhooks, [where('flowId', '==', id || '-')], [id]);
  const { rows: allHooks } = useWhCollection<WhWebhook>(WH.webhooks);
  const { rows: domains } = useWhCollection<WhDomain>(WH.domains);
  const { rows: templates } = useWhCollection<WhEmailTemplate>(WH.templates);
  const { rows: integrations } = useWhCollection<WhIntegration>(WH.integrations);

  const [draft, setDraft] = useState<WhFlow | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [clone, setClone] = useState<'clone' | 'template' | null>(null);
  const [testHook, setTestHook] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; submissionId?: string } | null>(null);

  const dirty = draft !== null;
  const view = draft || flow || null;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (flow === undefined) return <WhShell title="Flow"><Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box></WhShell>;
  if (!view) {
    return (
      <WhShell title="Flow not found">
        <Alert severity="warning">This flow doesn&apos;t exist (it may have been deleted). <Link component={RouterLink} to="/wh/flows">Back to flows</Link></Alert>
      </WhShell>
    );
  }

  const isMaster = view.type === 'master';
  const readOnly = isMaster && !isAdmin;
  const steps = view.steps || [];
  const errors = validateFlow(view);
  const hasErrors = Object.keys(errors).length > 0;

  const edit = (patch: Partial<WhFlow>) => { setDraft({ ...view, ...patch }); setMsg(null); };
  const setSteps = (next: FlowStep[]) => edit({ steps: next });
  const updateStep = (i: number, s: FlowStep) => setSteps(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...steps];
    const [s] = next.splice(i, 1);
    next.splice(i + dir, 0, s);
    setSteps(next);
  };
  const duplicate = (i: number) => {
    const s = steps[i];
    const copy: FlowStep = { ...s, id: newStepId(), name: `${stepTitle(s)} (copy)`, config: JSON.parse(JSON.stringify(s.config || {})) };
    delete copy.config.secretSetAt;
    setSteps([...steps.slice(0, i + 1), copy, ...steps.slice(i + 1)]);
  };
  const remove = (i: number) => {
    const s = steps[i];
    const refs = steps.some((x) => x.type === 'condition' && (x.config?.then === s.id || x.config?.else === s.id));
    if (refs && !window.confirm(`"${stepTitle(s)}" is the target of an If / then step. Delete anyway? (You'll need to fix that step.)`)) return;
    setSteps(steps.filter((_x, j) => j !== i));
  };
  const add = (type: StepType) => {
    setAddAnchor(null);
    const s = newStep(type);
    const last = steps[steps.length - 1];
    // Keep a trailing "Hand off to Master Flow" step last.
    if (last?.type === 'forward_to_master' && type !== 'forward_to_master') setSteps([...steps.slice(0, -1), s, last]);
    else setSteps([...steps, s]);
  };

  const save = async () => {
    setShowErrors(true);
    if (hasErrors) { setMsg({ ok: false, text: 'Please fix the highlighted problems before saving.' }); return; }
    setBusy(true);
    try {
      const { id: flowId, ...rest } = view;
      await saveWh(WH.flows, {
        ...rest,
        name: view.name.trim(),
        type: flow?.type || view.type,
        forwardToMaster: isMaster ? false : !!view.forwardToMaster,
        settings: view.settings || {},
      }, flowId);
      await writeAudit(profile, 'wh_flow_save', `wh_flows/${flowId}`, `${view.name} (${steps.length} steps)`);
      setDraft(null);
      setShowErrors(false);
      setMsg({ ok: true, text: 'Saved. Changes apply to new leads right away.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const discard = () => { if (window.confirm('Discard your unsaved changes?')) { setDraft(null); setShowErrors(false); setMsg(null); } };
  const back = () => { if (!dirty || window.confirm('You have unsaved changes. Leave without saving?')) navigate('/wh/flows'); };

  const runTest = async () => {
    if (!testHook) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await callWh<{ submissionId?: string; id?: string; message?: string }>('whTestWebhook', { webhookId: testHook });
      const sid = r?.submissionId || r?.id;
      setTestResult({ ok: true, text: r?.message || 'Test lead sent. It is processed within about a minute.', submissionId: sid });
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message });
    } finally { setTesting(false); }
  };

  const domainName = (did: string) => (domains || []).find((d) => d.id === did)?.name || 'Unknown website';
  const hookLabel = (w: WhWebhook) => `${domainName(w.domainId)} — ${w.formName || w.id}`;
  const inherited: WhSettings = isMaster ? (global || {}) : resolveSettings(global, master?.settings);
  const ctx: StepCtx = { flowId: view.id, steps, templates: templates || [], integrations: integrations || [], users, readOnly };
  const hooks = usedBy || [];

  return (
    <WhShell
      title={view.name || 'Untitled flow'}
      subtitle={<>{TYPE_LABEL[view.type]} · {isMaster ? 'runs for every lead from every website' : `used by ${hooks.length} webhook${hooks.length === 1 ? '' : 's'}`}{dirty && ' · unsaved changes'}</>}
      actions={<>
        <Button startIcon={<ArrowBack />} onClick={back}>Flows</Button>
        <Button startIcon={<ContentCopy />} onClick={() => setClone('clone')}>Clone</Button>
        {view.type === 'webhook' && <Button startIcon={<LibraryAdd />} onClick={() => setClone('template')}>Save as template</Button>}
        {dirty && <Button color="inherit" onClick={discard} disabled={busy}>Discard</Button>}
        <Button variant="contained" startIcon={<Save />} onClick={save} disabled={busy || !dirty || readOnly}>Save</Button>
      </>}
    >
      {readOnly && <Alert severity="info" sx={{ mb: 2 }}>Only admins can change the Master Flow. You can view it and clone it.</Alert>}
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Preview flow={view} master={isMaster ? null : master} />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, width: '100%' }}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <TextField label="Flow name" value={view.name} onChange={(e) => edit({ name: e.target.value })} size="small"
                disabled={readOnly} error={showErrors && !!errors['']} helperText={showErrors ? errors[''] : undefined} sx={{ flexGrow: 1 }} />
              <Chip label={TYPE_LABEL[view.type]} color={isMaster ? 'secondary' : 'default'} />
            </Stack>
            {!isMaster && (
              <FormControlLabel sx={{ mt: 1 }}
                control={<Switch checked={!!view.forwardToMaster} onChange={(e) => edit({ forwardToMaster: e.target.checked })} />}
                label="Continue in the Master Flow at the end (recommended — DMS, master sheet, CRM lead)" />
            )}
          </Paper>

          <Typography variant="h6" sx={{ mb: 1 }}>Steps</Typography>
          <Stack spacing={1}>
            {steps.map((s, i) => (
              <StepCard key={s.id} step={s} index={i} count={steps.length} ctx={ctx} error={showErrors ? errors[s.id] : undefined}
                onChange={(x) => updateStep(i, x)} onMove={(d) => move(i, d)} onDuplicate={() => duplicate(i)} onDelete={() => remove(i)} />
            ))}
            {!steps.length && (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">No steps yet. Add the first one — for example &quot;Send email&quot;.</Typography>
              </Paper>
            )}
            {!isMaster && view.forwardToMaster && !steps.some((s) => s.type === 'forward_to_master') && (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                ↓ Then the Master Flow runs automatically.
              </Typography>
            )}
          </Stack>
          <Button variant="outlined" startIcon={<Add />} sx={{ mt: 1.5 }} disabled={readOnly} onClick={(e) => setAddAnchor(e.currentTarget)}>Add step</Button>
          <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)} slotProps={{ paper: { sx: { maxWidth: 440 } } }}>
            {STEP_TYPES.filter((t) => !(isMaster && t === 'forward_to_master')).map((t) => (
              <MenuItem key={t} onClick={() => add(t)} sx={{ alignItems: 'flex-start', gap: 1.5, whiteSpace: 'normal' }}>
                <Box sx={{ mt: 0.25, color: 'primary.main' }}>{STEP_META[t].icon}</Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{STEP_META[t].label}</Typography>
                  <Typography variant="caption" color="text.secondary">{STEP_META[t].description}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Menu>

          <Accordion variant="outlined" sx={{ mt: 3 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>{isMaster ? 'Master Flow settings' : 'Flow settings'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {isMaster ? 'Override global settings for the Master Flow steps.' : 'Override settings for every webhook using this flow. Website and webhook settings can override these again.'}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pointerEvents: readOnly ? 'none' : undefined }}>
              <SettingsForm value={view.settings || {}} onChange={(v) => edit({ settings: v })} inherited={inherited} scope={isMaster ? 'master' : 'flow'} />
            </AccordionDetails>
          </Accordion>
        </Box>

        <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
          {!isMaster && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>Used by {hooks.length} webhook{hooks.length === 1 ? '' : 's'}</Typography>
              {view.type === 'template' && <Typography variant="caption" color="text.secondary">Changes here apply to all of them.</Typography>}
              <List dense disablePadding sx={{ maxHeight: 260, overflow: 'auto' }}>
                {hooks.slice(0, 200).map((w) => (
                  <ListItem key={w.id} disableGutters>
                    <ListItemText primary={<Link component={RouterLink} to={`/wh/webhooks/${w.id}`}>{hookLabel(w)}</Link>}
                      secondary={w.status === 'paused' ? 'Paused' : undefined} />
                  </ListItem>
                ))}
              </List>
              {!hooks.length && <Typography variant="body2" color="text.secondary">No webhooks use this flow yet.</Typography>}
            </Paper>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>Test this flow</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Sends a sample lead (Jane Sample) through a webhook{isMaster ? '; the Master Flow runs after its own flow' : ' using this flow'}. Save your changes first.
            </Typography>
            <TextField select size="small" fullWidth label="Webhook" value={testHook} onChange={(e) => setTestHook(e.target.value)}>
              {(isMaster ? allHooks || [] : hooks).slice(0, 300).map((w) => <MenuItem key={w.id} value={w.id}>{hookLabel(w)}</MenuItem>)}
              {!(isMaster ? allHooks || [] : hooks).length && <MenuItem value="" disabled>No webhooks to test with</MenuItem>}
            </TextField>
            <Button fullWidth sx={{ mt: 1 }} variant="outlined" startIcon={testing ? <CircularProgress size={16} /> : <PlayArrow />}
              disabled={!testHook || testing || dirty} onClick={runTest}>
              {dirty ? 'Save first to test' : 'Send test lead'}
            </Button>
            {testResult && (
              <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mt: 1 }}>
                {testResult.text}
                {testResult.submissionId && <> <Link component={RouterLink} to={`/wh/submissions/${testResult.submissionId}`}>Open the test submission</Link></>}
              </Alert>
            )}
          </Paper>
          {hasErrors && showErrors && (
            <>
              <Divider sx={{ my: 2 }} />
              <Alert severity="error">
                {Object.entries(errors).map(([sid, e]) => {
                  const i = steps.findIndex((s) => s.id === sid);
                  return <div key={sid}>{i >= 0 ? `Step ${i + 1}: ` : ''}{e}</div>;
                })}
              </Alert>
            </>
          )}
        </Box>
      </Stack>

      {clone && (
        <Wh2CloneDialog key={`${view.id}:${clone}`} flow={view} mode={clone} webhooks={allHooks || []} domains={domains || []}
          onClose={() => setClone(null)} />
      )}
    </WhShell>
  );
};

export default WhFlowBuilder;
