import React, { useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Collapse, FormControlLabel, IconButton, MenuItem, Paper, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { ArrowDownward, ArrowUpward, ContentCopy, Delete, ExpandLess, ExpandMore } from '@mui/icons-material';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { MpProfile } from '../../mp/types';
import { fmtTime } from '../data';
import { fieldLabel } from '../shared';
import { CONDITION_OPS, STEP_META, describeStep } from '../steps';
import { LEAD_FIELDS, TRACKING_FIELDS, WH } from '../types';
import type { FlowStep, WhEmailTemplate, WhIntegration } from '../types';
import { ChipList } from './SettingsForm';

export interface StepCtx {
  flowId: string;
  steps: FlowStep[];
  templates: WhEmailTemplate[];
  integrations: WhIntegration[];
  users: MpProfile[];
  readOnly?: boolean;
}

const ALL_FIELDS = [...LEAD_FIELDS, ...TRACKING_FIELDS] as string[];
/** Extra sheet columns the engine understands. */
const SHEET_SPECIAL: Record<string, string> = {
  received_at: 'Date received', domain: 'Website', form_name: 'Form', status: 'Status', submission_id: 'Submission id',
  lead_url: 'Link to lead', test: 'Test lead?',
};
const SHEET_COLUMNS = [...Object.keys(SHEET_SPECIAL), ...ALL_FIELDS.filter((f) => f !== 'form_name')];
const sheetColLabel = (f: string) => SHEET_SPECIAL[f] || fieldLabel(f);

const Help: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{children}</Typography>
);

const InheritBool: React.FC<{ label: string; value: unknown; onChange: (v: boolean | undefined) => void }> = ({ label, value, onChange }) => (
  <TextField select size="small" label={label} sx={{ minWidth: 240 }} value={value === undefined ? '' : value ? 'on' : 'off'}
    onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'on')}>
    <MenuItem value="">Use settings</MenuItem>
    <MenuItem value="on">On</MenuItem>
    <MenuItem value="off">Off</MenuItem>
  </TextField>
);

/** Per-type config editor. */
const StepConfig: React.FC<{ step: FlowStep; ctx: StepCtx; set: (patch: Record<string, unknown>) => void }> = ({ step, ctx, set }) => {
  const c = step.config || {};
  const s = (k: string) => (c[k] === undefined || c[k] === null ? '' : String(c[k]));
  const arr = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).map(String) : []);
  const userName = (uid: string) => { const u = ctx.users.find((x) => x.uid === uid); return u ? u.name || u.email : uid; };
  const [secret, setSecret] = useState('');
  const [secretMsg, setSecretMsg] = useState('');

  switch (step.type) {
  case 'validate':
    return (
      <Box>
        <ChipList value={arr('required')} onChange={(v) => set({ required: v })} options={[...LEAD_FIELDS]} getLabel={fieldLabel}
          free={false} placeholder="Use required fields from settings" />
        <Help>Leads missing any of these fields stop here. Empty = use the "Required fields" setting. An email or phone is always required.</Help>
      </Box>
    );
  case 'dedupe':
    return (
      <Stack spacing={1.5}>
        <Box>
          <ChipList value={arr('matchOn')} onChange={(v) => set({ matchOn: v })} options={[...LEAD_FIELDS]} getLabel={fieldLabel}
            free={false} placeholder="Match on (default: settings)" />
          <Help>Two leads are the same person when any of these fields match.</Help>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField size="small" type="number" label="Within (hours)" value={s('windowHours')} sx={{ maxWidth: 200 }}
            onChange={(e) => set({ windowHours: e.target.value === '' ? undefined : Math.max(1, Math.round(Number(e.target.value) || 1)) })}
            helperText="Empty = settings default" />
          <TextField select size="small" label="When it's a duplicate" value={s('onDuplicate') || 'stop'} sx={{ minWidth: 260 }}
            onChange={(e) => set({ onDuplicate: e.target.value })}>
            <MenuItem value="stop">Mark as duplicate and stop</MenuItem>
            <MenuItem value="continue">Mark as duplicate but continue</MenuItem>
          </TextField>
        </Stack>
      </Stack>
    );
  case 'condition': {
    const op = CONDITION_OPS.find((o) => o.value === c.op);
    const targets = ctx.steps.filter((x) => x.id !== step.id);
    const targetSelect = (k: 'then' | 'else', label: string) => (
      <TextField select size="small" label={label} value={s(k) || 'continue'} sx={{ minWidth: 240 }} onChange={(e) => set({ [k]: e.target.value })}>
        <MenuItem value="continue">Continue with the next step</MenuItem>
        <MenuItem value="stop">Stop this flow</MenuItem>
        {targets.map((t) => (
          <MenuItem key={t.id} value={t.id}>Jump to {ctx.steps.indexOf(t) + 1}. {t.name || STEP_META[t.type].label}</MenuItem>
        ))}
        {!!c[k] && !['continue', 'stop'].includes(s(k)) && !targets.some((t) => t.id === c[k]) && (
          <MenuItem value={s(k)}>Missing step ({s(k)})</MenuItem>
        )}
      </TextField>
    );
    return (
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Autocomplete freeSolo autoSelect size="small" options={ALL_FIELDS} value={s('field')} sx={{ minWidth: 220 }}
            getOptionLabel={(o) => (ALL_FIELDS.includes(o) ? `${fieldLabel(o)} (${o})` : o)}
            onChange={(_e, v) => set({ field: (v || '').trim() })}
            renderInput={(p) => <TextField {...p} label="Field" helperText="Pick a standard field or type a custom field name" />} />
          <TextField select size="small" label="Test" value={s('op') || '=='} sx={{ minWidth: 180 }} onChange={(e) => set({ op: e.target.value })}>
            {CONDITION_OPS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          {op?.needsValue !== false && (
            <TextField size="small" label="Value" value={s('value')} onChange={(e) => set({ value: e.target.value })}
              helperText="Not case-sensitive" />
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {targetSelect('then', 'If true')}
          {targetSelect('else', 'Otherwise')}
        </Stack>
        <Help>Jumps can only go forward (to a later step), so a flow can never loop.</Help>
      </Stack>
    );
  }
  case 'email':
    return (
      <Stack spacing={1.5}>
        <TextField select size="small" label="Template" value={s('templateId') === 'inherit' ? '' : s('templateId')}
          onChange={(e) => set({ templateId: e.target.value || undefined })}>
          <MenuItem value="">Use the template from settings</MenuItem>
          {ctx.templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name || t.id}</MenuItem>)}
        </TextField>
        <Box>
          <ChipList value={arr('to')} onChange={(v) => set({ to: v })} placeholder="To (empty = from settings)" />
          <Help>Filled in = these addresses replace the ones from settings for this step.</Help>
        </Box>
        <TextField select size="small" label="Send using" value={s('integrationId')}
          onChange={(e) => set({ integrationId: e.target.value || undefined })}>
          <MenuItem value="">The email connection from settings</MenuItem>
          {ctx.integrations.filter((i) => i.type === 'smtp').map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
        </TextField>
        <ChipList value={arr('cc')} onChange={(v) => set({ cc: v })} placeholder="CC (empty = from settings)" />
        <ChipList value={arr('bcc')} onChange={(v) => set({ bcc: v })} placeholder="BCC (empty = from settings)" />
        <TextField size="small" label="Subject (optional)" value={s('subject')} onChange={(e) => set({ subject: e.target.value || undefined })}
          helperText="Overrides the template's subject. Merge tags like {{first_name}} work." />
        <InheritBool label="Customer thank-you email" value={c.autoReply} onChange={(v) => set({ autoReply: v })} />
      </Stack>
    );
  case 'sheets': {
    const custom = c.spreadsheetId !== undefined && c.spreadsheetId !== null && c.spreadsheetId !== 'inherit';
    return (
      <Stack spacing={1.5}>
        <TextField select size="small" label="Spreadsheet" value={custom ? 'custom' : 'inherit'} sx={{ maxWidth: 360 }}
          onChange={(e) => set({ spreadsheetId: e.target.value === 'inherit' ? 'inherit' : '' })}>
          <MenuItem value="inherit">The sheet from settings</MenuItem>
          <MenuItem value="custom">A specific sheet…</MenuItem>
        </TextField>
        {custom && (
          <TextField size="small" label="Sheet link or id" value={s('spreadsheetId')}
            onChange={(e) => set({ spreadsheetId: e.target.value.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || e.target.value.trim() })}
            helperText="Share the sheet as Editor with 470095494000-compute@developer.gserviceaccount.com" />
        )}
        <TextField size="small" label="Tab (optional)" value={s('tab')} onChange={(e) => set({ tab: e.target.value || undefined })}
          helperText="Empty = the tab from settings (or the first tab)." />
        <Box>
          <ChipList value={arr('columns')} onChange={(v) => set({ columns: v })} options={SHEET_COLUMNS} getLabel={sheetColLabel}
            free={false} placeholder="Columns (empty = all standard fields)" />
          <Help>Which fields become columns, in this order. Empty = all standard fields plus the date.</Help>
        </Box>
      </Stack>
    );
  }
  case 'ga4':
    return (
      <Stack spacing={1}>
        <TextField size="small" label="Event name" value={s('event')} placeholder="generate_lead" sx={{ maxWidth: 320 }}
          onChange={(e) => set({ event: e.target.value.replace(/[^\w]/g, '_') || undefined })}
          helperText="GA4 recommends generate_lead for form leads." />
        <FormControlLabel control={<Switch checked={!!c.debug} onChange={(e) => set({ debug: e.target.checked })} />}
          label="Debug mode (shows in GA4 DebugView; use while testing)" />
        <Help>Uses the Measurement ID and API secret from settings (Google Analytics section).</Help>
      </Stack>
    );
  case 'dms_sync':
    return (
      <Stack spacing={1}>
      <TextField select size="small" label="DMS connection" value={s('integrationId') || 'inherit'} sx={{ maxWidth: 400 }}
        onChange={(e) => set({ integrationId: e.target.value })}
        helperText="Connections are managed by admins in Settings → Integrations.">
        <MenuItem value="inherit">The connection from settings</MenuItem>
        {ctx.integrations.filter((i) => i.type === 'dms').map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
      </TextField>
      <InheritBool label="Send test leads too" value={c.sendTests} onChange={(v) => set({ sendTests: v })} />
      </Stack>
    );
  case 'webhook_out': {
    const headers = (c.headers && typeof c.headers === 'object' ? c.headers : {}) as Record<string, string>;
    const rows = Object.entries(headers);
    const setHeaders = (entries: Array<[string, string]>) => set({ headers: Object.fromEntries(entries) });
    const saveSecret = async () => {
      setSecretMsg('');
      try {
        await setDoc(doc(db, WH.integrationSecrets, `webhook_out_${ctx.flowId}_${step.id}`), { secret: secret.trim(), setAt: Date.now() });
        set({ secretSetAt: Date.now() });
        setSecret('');
        setSecretMsg('Secret saved. Save the flow to keep the change.');
      } catch (e) { setSecretMsg(`Could not save: ${(e as Error).message}`); }
    };
    return (
      <Stack spacing={1.5}>
        <TextField size="small" label="URL" value={s('url')} placeholder="https://hooks.zapier.com/…" onChange={(e) => set({ url: e.target.value.trim() })}
          error={!!c.url && !/^https:\/\//i.test(s('url'))} helperText="Must start with https://" />
        <Stack direction="row" spacing={1.5}>
          <TextField select size="small" label="Method" value={s('method') || 'POST'} sx={{ minWidth: 120 }} onChange={(e) => set({ method: e.target.value })}>
            <MenuItem value="POST">POST</MenuItem>
            <MenuItem value="PUT">PUT</MenuItem>
          </TextField>
          <TextField select size="small" label="Format" value={s('format') || 'json'} sx={{ minWidth: 160 }} onChange={(e) => set({ format: e.target.value })}>
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="form">Form (URL-encoded)</MenuItem>
          </TextField>
        </Stack>
        <Box>
          <Typography variant="subtitle2">Headers</Typography>
          {rows.map(([k, v], i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField size="small" label="Name" value={k} onChange={(e) => setHeaders(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
              <TextField size="small" label="Value" value={v} sx={{ flexGrow: 1 }} onChange={(e) => setHeaders(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
              <IconButton aria-label="Remove header" onClick={() => setHeaders(rows.filter((_r, j) => j !== i))}><Delete fontSize="small" /></IconButton>
            </Stack>
          ))}
          <Button size="small" sx={{ mt: 0.5 }} onClick={() => setHeaders([...rows, [`X-Header-${rows.length + 1}`, '']])}>Add header</Button>
          <Help>Don&apos;t put passwords in headers — anyone who can edit flows can see them. Use the signing secret below instead.</Help>
        </Box>
        <Box>
          <Typography variant="subtitle2">Signing secret (optional)</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 0.5 }}>
            <TextField size="small" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder={c.secretSetAt ? `••• saved on ${fmtTime(Number(c.secretSetAt))}` : 'Enter a secret'} sx={{ flexGrow: 1 }} />
            <Button variant="outlined" disabled={!secret.trim() || ctx.readOnly} onClick={saveSecret}>Save secret</Button>
          </Stack>
          <Help>When set, every request carries X-Tigon-Signature: sha256=&lt;HMAC of the body&gt; so the receiver can verify it came from us. The secret is write-only.</Help>
          {secretMsg && <Typography variant="caption" color={secretMsg.startsWith('Could') ? 'error' : 'success.main'}>{secretMsg}</Typography>}
        </Box>
      </Stack>
    );
  }
  case 'delay':
    return (
      <TextField size="small" type="number" label="Minutes" value={s('minutes')} sx={{ maxWidth: 200 }}
        slotProps={{ htmlInput: { min: 1, max: 10080 } }}
        onChange={(e) => set({ minutes: e.target.value === '' ? '' : Math.round(Number(e.target.value) || 0) })}
        helperText="1 minute to 7 days (10080). The lead waits, then the next step runs." />
    );
  case 'create_lead':
    return (
      <Stack spacing={1}>
      <TextField select size="small" label="Assign to" value={s('ownerUid')} sx={{ maxWidth: 400 }}
        onChange={(e) => set({ ownerUid: e.target.value || undefined })} helperText="Empty = the lead owner from settings.">
        <MenuItem value="">The lead owner from settings</MenuItem>
        {ctx.users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
      </TextField>
      <FormControlLabel control={<Switch checked={!!c.force} onChange={(e) => set({ force: e.target.checked })} />}
        label="Always create (even when &quot;Create a CRM lead&quot; is off in settings)" />
      </Stack>
    );
  case 'notify':
    return (
      <Stack spacing={1.5}>
        <Box>
          <ChipList value={arr('uids')} onChange={(v) => set({ uids: v })} options={ctx.users.map((u) => u.uid)} getLabel={userName}
            free={false} placeholder="People (empty = from settings)" />
          <Help>These people get a push notification on their phone (TIGON IOT app).</Help>
        </Box>
        <TextField size="small" label="Message" value={s('text')} multiline minRows={2} onChange={(e) => set({ text: e.target.value })}
          helperText="Merge tags work, e.g. {{first_name}} {{last_name}}, {{phone1}}, {{model}}, {{domain_name}}." />
      </Stack>
    );
  case 'forward_to_master':
    return (
      <Alert severity="info">
        The lead continues in the Master Flow here. You usually don&apos;t need this step: when &quot;Continue in Master Flow&quot;
        is on, the Master Flow runs automatically at the end.
      </Alert>
    );
  default:
    return null;
  }
};

/** One step of a flow: header with controls, expandable config editor. */
const StepCard: React.FC<{
  step: FlowStep;
  index: number;
  count: number;
  ctx: StepCtx;
  error?: string;
  onChange: (s: FlowStep) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ step, index, count, ctx, error, onChange, onMove, onDuplicate, onDelete }) => {
  const [open, setOpen] = useState(false);
  const meta = STEP_META[step.type];
  const enabled = step.enabled !== false;
  const ro = !!ctx.readOnly;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, opacity: enabled ? 1 : 0.6, borderColor: error ? 'error.main' : undefined }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.25 }}>
          {meta?.icon}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 600 }}>{index + 1}. {step.name || meta?.label}</Typography>
            <Chip size="small" variant="outlined" label={meta?.label || step.type} />
            {!enabled && <Chip size="small" label="Off" />}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{describeStep(step)}</Typography>
          {error && <Typography variant="caption" color="error">{error}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Tooltip title={enabled ? 'Turn this step off' : 'Turn this step on'}>
            <Switch size="small" checked={enabled} disabled={ro} onChange={(e) => onChange({ ...step, enabled: e.target.checked })}
              inputProps={{ 'aria-label': 'Step enabled' }} />
          </Tooltip>
          <Box sx={{ display: { xs: open ? 'flex' : 'none', sm: 'flex' } }}>
            <Tooltip title="Move up"><span><IconButton size="small" aria-label="Move up" disabled={ro || index === 0} onClick={() => onMove(-1)}><ArrowUpward fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="Move down"><span><IconButton size="small" aria-label="Move down" disabled={ro || index === count - 1} onClick={() => onMove(1)}><ArrowDownward fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="Duplicate"><span><IconButton size="small" aria-label="Duplicate" disabled={ro} onClick={onDuplicate}><ContentCopy fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="Delete"><span><IconButton size="small" aria-label="Delete" disabled={ro} onClick={onDelete}><Delete fontSize="small" /></IconButton></span></Tooltip>
          </Box>
          <IconButton size="small" aria-label={open ? 'Collapse' : 'Edit'} onClick={() => setOpen(!open)}>{open ? <ExpandLess /> : <ExpandMore />}</IconButton>
        </Box>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1.5, pl: { sm: 5 }, pointerEvents: ro ? 'none' : undefined }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{meta?.description}</Typography>
          <TextField size="small" label="Step name" value={step.name || ''} placeholder={meta?.label} sx={{ mb: 2, maxWidth: 400 }} fullWidth
            onChange={(e) => onChange({ ...step, name: e.target.value })} />
          <StepConfig step={step} ctx={ctx} set={(patch) => onChange({ ...step, config: { ...step.config, ...patch } })} />
        </Box>
      </Collapse>
    </Paper>
  );
};

export default StepCard;
