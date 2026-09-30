import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select,
  Stack, Switch, TextField, Typography,
} from '@mui/material';
import { Add, ContentCopy, Delete, OpenInNew, Save } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import SettingsForm from '../components/SettingsForm';
import SetupPacket from '../components/SetupPacket';
import HmacSecretPanel from '../components/HmacSecretPanel';
import { createWebhookSecret, secretDocId } from '../webhookSecret';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import StatusChip from '../components/StatusChip';
import RecentSubmissions from '../components/Wh1Recent';
import { DayBars, Panel } from '../components/Wh1Ui';
import { ago, errText, useFlows, useGlobal, useMasterFlow, useNow } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { patchWh, removeWh, useWhDoc } from '../data';
import { fieldLabel, resolveSettings } from '../shared';
import { LEAD_FIELDS, TRACKING_FIELDS, WH } from '../types';
import type { WhDomain, WhFlow, WhSettings, WhWebhook } from '../types';
import { cloneFlow } from '../websites';
import { lastDayKeys, seriesFor, useWhStats } from '../stats';

const TARGETS = [...LEAD_FIELDS.filter((f) => f !== 'user_ip'), ...TRACKING_FIELDS.filter((f) => f !== 'user_agent')];

interface MapRow { from: string; to: string }

const Editor: React.FC<{ webhook: WhWebhook }> = ({ webhook }) => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const now = useNow();
  const global = useGlobal();
  const master = useMasterFlow(global);
  const domain = useWhDoc<WhDomain>(WH.domains, webhook.domainId);
  const { rows: flows } = useFlows();
  const { rows: stats } = useWhStats(30);

  const [formName, setFormName] = useState(webhook.formName);
  const [status, setStatus] = useState(webhook.status);
  const [flowId, setFlowId] = useState(webhook.flowId);
  const [settings, setSettings] = useState<WhSettings>(webhook.settings || {});
  const [map, setMap] = useState<MapRow[]>(() => Object.entries(webhook.fieldMap || {}).map(([from, to]) => ({ from, to })));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flow = (flows || []).find((f) => f.id === flowId);
  const assignable = useMemo(() => (flows || []).filter((f) => f.type !== 'master').sort((a, b) => a.name.localeCompare(b.name)), [flows]);
  const savedMap = JSON.stringify(webhook.fieldMap || {});
  const mapObj = Object.fromEntries(map.filter((r) => r.from.trim() && r.to).map((r) => [r.from.trim(), r.to]));
  const dirty = formName !== webhook.formName || status !== webhook.status || flowId !== webhook.flowId ||
    JSON.stringify(settings) !== JSON.stringify(webhook.settings || {}) || JSON.stringify(mapObj) !== savedMap;
  const series = useMemo(() => seriesFor(stats, lastDayKeys(30, now), (r) => r.byWebhook?.[webhook.id]), [stats, now, webhook.id]);
  const total30 = series.reduce((a, b) => a + b.count, 0);
  const inherited = resolveSettings(global || undefined, master?.settings, domain?.settings, flow?.settings);
  const packetSettings = resolveSettings(inherited, webhook.settings);

  const save = async () => {
    if (!formName.trim()) { setMsg({ ok: false, text: 'Enter a form name.' }); return; }
    setBusy('save');
    setMsg(null);
    try {
      await patchWh(WH.webhooks, webhook.id, { formName: formName.trim(), status, flowId, settings, fieldMap: mapObj });
      const changes = [
        status !== webhook.status && `status ${status}`, flowId !== webhook.flowId && `flow ${flowId}`,
      ].filter(Boolean).join(', ');
      await writeAudit(profile, 'wh_webhook_update', `${domain?.name || ''} · ${formName.trim()}`, `${webhook.id}${changes ? ` · ${changes}` : ''}`);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  };

  const privateCopy = async () => {
    if (!flow) return;
    if (!window.confirm(`Make a private copy of "${flow.name}" for this form? Later changes to "${flow.name}" will no longer apply here.`)) return;
    setBusy('copy');
    try {
      const id = await cloneFlow(flow as WhFlow, `${domain?.name || 'Website'} — ${formName.trim() || webhook.formName}`);
      await patchWh(WH.webhooks, webhook.id, { flowId: id });
      setFlowId(id);
      await writeAudit(profile, 'wh_flow_private_copy', `${domain?.name || ''} · ${webhook.formName}`, `copied ${flow.id} → ${id}`);
      setMsg({ ok: true, text: 'Private copy created and assigned. Open it in the flow builder to change it.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete the webhook "${webhook.formName}"? Its address stops working immediately. Past leads stay in Submissions.`)) return;
    setBusy('delete');
    try {
      await removeWh(WH.webhooks, webhook.id);
      await writeAudit(profile, 'wh_webhook_delete', `${domain?.name || ''} · ${webhook.formName}`, webhook.id);
      navigate(domain ? `/wh/websites/${domain.id}` : '/wh/webhooks');
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setBusy('');
    }
  };

  const setHmac = async (on: boolean) => {
    if (on && !window.confirm('Require a signature? Posts without a valid X-Tigon-Signature header will be rejected — website forms cannot sign. A signing secret is created for you below if there isn\'t one yet.')) return;
    setBusy('hmac');
    try {
      if (on && !(await getDoc(doc(db, WH.integrationSecrets, secretDocId(webhook.id)))).exists()) {
        await createWebhookSecret(webhook.id);
      }
      await patchWh(WH.webhooks, webhook.id, { hmacRequired: on });
      await writeAudit(profile, 'wh_webhook_hmac', `${domain?.name || ''} · ${webhook.formName}`, `${webhook.id} · signature ${on ? 'required' : 'off'}`);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  };

  const setRow = (i: number, r: Partial<MapRow>) => setMap(map.map((x, j) => (j === i ? { ...x, ...r } : x)));

  return (
    <WhShell
      title={webhook.formName}
      subtitle={domain ? <>Form on <RouterLink to={`/wh/websites/${domain.id}`}>{domain.name}</RouterLink> · last lead {ago(webhook.lastReceivedAt, now)}</> : `Last lead ${ago(webhook.lastReceivedAt, now)}`}
      actions={<Button variant="contained" startIcon={<Save />} onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}
    >
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {domain?.status === 'paused' && <Alert severity="warning" sx={{ mb: 2 }}>The website is paused, so this form's leads are rejected.</Alert>}
      <Stack spacing={2}>
        <Panel title="Webhook" action={<StatusChip status={webhook.status} />}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Form name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            <FormControl>
              <InputLabel id="wk-status">Status</InputLabel>
              <Select labelId="wk-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value as WhWebhook['status'])}>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="paused">Paused (reject leads)</MenuItem>
              </Select>
            </FormControl>
            <Box>
              <FormControl fullWidth>
                <InputLabel id="wk-flow">Flow</InputLabel>
                <Select labelId="wk-flow" label="Flow" value={flows ? flowId : ''} onChange={(e) => setFlowId(e.target.value)}>
                  {assignable.map((f) => <MenuItem key={f.id} value={f.id}>{f.name} {f.type === 'template' ? '(shared)' : '(private)'}</MenuItem>)}
                  {flows && !assignable.some((f) => f.id === flowId) && <MenuItem value={flowId} disabled>(missing flow)</MenuItem>}
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button size="small" startIcon={<OpenInNew />} component={RouterLink} to={`/wh/flows/${flowId}`} disabled={!flow}>Open in flow builder</Button>
                {flow?.type === 'template' && (
                  <Button size="small" startIcon={<ContentCopy />} onClick={privateCopy} disabled={!!busy || flowId !== webhook.flowId}>Make a private copy of this flow</Button>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {flow?.type === 'template' ? 'Shared flow: changes to it apply to every form using it.' : flow ? 'Private flow: changes to it only affect the forms it is assigned to.' : ''}
              </Typography>
            </Box>
            <Box>
              <FormControlLabel control={<Switch checked={!!webhook.hmacRequired} onChange={(e) => setHmac(e.target.checked)} disabled={busy === 'hmac'} />} label="Require a signature (HMAC)" />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Only for server-to-server posts. Website forms cannot sign, so leave this off for forms on a website.
              </Typography>
              {webhook.hmacRequired && <HmacSecretPanel webhook={webhook} />}
            </Box>
          </Box>
        </Panel>

        <Panel title="Field names" action={<Button size="small" startIcon={<Add />} onClick={() => setMap([...map, { from: '', to: '' }])}>Add row</Button>}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            If this form's fields have other names than the standard ones (e.g. "fname" instead of "first_name"), map them here.
            Standard names don't need a row.
          </Typography>
          {!map.length && <Typography variant="body2" color="text.secondary">No mappings — the form uses the standard field names.</Typography>}
          <Stack spacing={1}>
            {map.map((r, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <TextField size="small" label="Incoming name" value={r.from} onChange={(e) => setRow(i, { from: e.target.value })} sx={{ flex: '1 1 200px' }} />
                <Typography color="text.secondary">→</Typography>
                <FormControl size="small" sx={{ flex: '1 1 200px' }}>
                  <InputLabel id={`fm-${i}`}>Standard field</InputLabel>
                  <Select labelId={`fm-${i}`} label="Standard field" value={r.to} onChange={(e) => setRow(i, { to: e.target.value })}>
                    {TARGETS.map((f) => <MenuItem key={f} value={f}>{fieldLabel(f)} ({f})</MenuItem>)}
                  </Select>
                </FormControl>
                <IconButton aria-label="Remove row" onClick={() => setMap(map.filter((_x, j) => j !== i))}><Delete /></IconButton>
              </Box>
            ))}
          </Stack>
        </Panel>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontSize: 18 }}>Settings for this form only</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Most forms don't need anything here — they use the website and flow settings (shown in grey). Set a value only to override it for this form.
          </Typography>
          <SettingsForm value={settings} onChange={setSettings} inherited={inherited} scope="webhook" />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" startIcon={<Save />} onClick={save} disabled={!dirty || !!busy}>Save</Button>
          </Box>
        </Paper>

        {dirty && <Alert severity="info">You have unsaved changes — the setup packet below uses the saved settings.</Alert>}
        <SetupPacket webhook={webhook} domain={domain} settings={packetSettings} />

        <Panel title={`Leads per day (last 30 days: ${total30})`}>
          {stats === undefined ? <CircularProgress size={24} /> : <DayBars data={series} height={180} />}
        </Panel>

        <Panel title="Recent leads" action={<Button size="small" component={RouterLink} to={`/wh/submissions?webhook=${webhook.id}`}>All leads</Button>}>
          <RecentSubmissions field="webhookId" id={webhook.id} />
        </Panel>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontSize: 18 }}>Delete webhook</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            The address stops working immediately. To stop leads temporarily, set the status to Paused instead.
          </Typography>
          <Button color="error" variant="outlined" startIcon={<Delete />} onClick={del} disabled={!!busy}>Delete webhook</Button>
        </Paper>
      </Stack>
    </WhShell>
  );
};

/** One webhook (form): flow, field names, settings, setup packet, stats and leads. */
const WhWebhookDetail: React.FC = () => {
  const { id } = useParams();
  const webhook = useWhDoc<WhWebhook>(WH.webhooks, id);
  if (webhook === undefined) return <WhShell title="Webhook"><CircularProgress aria-label="Loading" /></WhShell>;
  if (!webhook) return <WhShell title="Webhook"><Alert severity="warning">This webhook was not found. <RouterLink to="/wh/webhooks">Back to webhooks</RouterLink></Alert></WhShell>;
  return <Editor key={webhook.id} webhook={webhook} />;
};

export default WhWebhookDetail;
