import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel,
  MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, Delete, Pause, PlayArrow, Save } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import LeadChannelSelect, { DEFAULT_LEAD_CHANNEL } from '../components/LeadChannelSelect';
import { relabelLeads } from '../websites';
import SettingsForm from '../components/SettingsForm';
import StatusChip from '../components/StatusChip';
import RecentSubmissions from '../components/Wh1Recent';
import { DayBars, Panel } from '../components/Wh1Ui';
import { ago, errText, useFlows, useGlobal, useMasterFlow, useNow, useWebhooks } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { patchWh, removeWh, useWhDoc } from '../data';
import { resolveSettings } from '../shared';
import { WH } from '../types';
import type { WhDomain, WhSettings } from '../types';
import { PLATFORMS, createWebhook, normalizeSiteUrl } from '../websites';
import { lastDayKeys, summarize, useWhStats } from '../stats';

const Editor: React.FC<{ domain: WhDomain }> = ({ domain }) => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const isAdmin = profile?.role === 'admin';
  const now = useNow();
  const global = useGlobal();
  const master = useMasterFlow(global);
  const { rows: allHooks } = useWebhooks();
  const { rows: flows } = useFlows();
  const { rows: stats } = useWhStats(30);

  const [name, setName] = useState(domain.name);
  const [urlInput, setUrlInput] = useState(domain.url);
  const [platform, setPlatform] = useState(domain.platform || 'custom');
  const [status, setStatus] = useState(domain.status);
  const [leadChannel, setLeadChannel] = useState(domain.leadChannel || DEFAULT_LEAD_CHANNEL);
  const [settings, setSettings] = useState<WhSettings>(domain.settings || {});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newForm, setNewForm] = useState('');

  const hooks = useMemo(() => (allHooks || []).filter((w) => w.domainId === domain.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), [allHooks, domain.id]);
  const flowName = (id: string) => (flows || []).find((f) => f.id === id)?.name || '(missing flow)';
  const series = useMemo(() => summarize(stats, lastDayKeys(30, now), domain.id).series, [stats, now, domain.id]);
  const url = normalizeSiteUrl(urlInput);
  const dirty = name !== domain.name || urlInput !== domain.url || platform !== (domain.platform || 'custom') || status !== domain.status ||
    leadChannel !== (domain.leadChannel || DEFAULT_LEAD_CHANNEL) ||
    JSON.stringify(settings) !== JSON.stringify(domain.settings || {});

  // "Add another form" uses the flow of this website's newest webhook, else the default flow.
  const newest = hooks.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const flowChoice = newest?.flowId || global?.defaultFlowId || '';

  const save = async () => {
    if (!name.trim()) { setMsg({ ok: false, text: 'Enter a name.' }); return; }
    if (!url.url) { setMsg({ ok: false, text: url.error || 'Enter the website address.' }); return; }
    setBusy('save');
    setMsg(null);
    try {
      await patchWh(WH.domains, domain.id, { name: name.trim(), url: url.url, platform, status, settings, leadChannel });
      setUrlInput(url.url);
      let relabeled = 0;
      if (leadChannel !== (domain.leadChannel || DEFAULT_LEAD_CHANNEL)) relabeled = await relabelLeads(domain.id, leadChannel);
      await writeAudit(profile, 'wh_domain_update', name.trim(), `${domain.id}${status !== domain.status ? ` · status ${status}` : ''}`);
      setMsg({ ok: true, text: relabeled ? `Saved. ${relabeled} existing lead(s) moved to the new channel.` : 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  };

  const setDomainStatus = async (s: 'active' | 'paused') => {
    setBusy('status');
    try {
      await patchWh(WH.domains, domain.id, { status: s });
      setStatus(s);
      await writeAudit(profile, s === 'paused' ? 'wh_domain_pause' : 'wh_domain_activate', domain.name, domain.id);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  };

  const addForm = async () => {
    if (!flowChoice) { setMsg({ ok: false, text: 'No flow to use — ask an admin to finish the Webhook Flows setup.' }); return; }
    setBusy('add');
    try {
      const { id } = await createWebhook(domain.id, flowChoice, newForm || 'Contact form', profile);
      await writeAudit(profile, 'wh_webhook_create', `${domain.name} · ${newForm || 'Contact form'}`, id);
      setAddOpen(false);
      navigate(`/wh/webhooks/${id}`);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  };

  const del = async () => {
    if (hooks.length) return;
    if (!window.confirm(`Delete the website "${domain.name}"? Its past leads stay in Submissions.`)) return;
    setBusy('delete');
    try {
      await removeWh(WH.domains, domain.id);
      await writeAudit(profile, 'wh_domain_delete', domain.name, domain.id);
      navigate('/wh/websites');
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setBusy('');
    }
  };

  return (
    <WhShell
      title={domain.name}
      subtitle={<a href={domain.url} target="_blank" rel="noreferrer">{domain.url}</a>}
      actions={(
        <>
          {status === 'active' ?
            <Button variant="outlined" startIcon={<Pause />} onClick={() => setDomainStatus('paused')} disabled={!!busy}>Pause website</Button> :
            <Button variant="outlined" startIcon={<PlayArrow />} onClick={() => setDomainStatus('active')} disabled={!!busy}>Activate website</Button>}
          <Button variant="contained" startIcon={<Save />} onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
        </>
      )}
    >
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {status === 'paused' && <Alert severity="warning" sx={{ mb: 2 }}>This website is paused — leads from its forms are rejected.</Alert>}
      <Stack spacing={2}>
        <Panel title="Website">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Website address" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} error={!!url.error}
              helperText={url.error || 'Leads are accepted from this address (plus any extra allowed addresses in the settings).'} />
            <FormControl>
              <InputLabel id="wd-platform">Website builder</InputLabel>
              <Select labelId="wd-platform" label="Website builder" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </Select>
            </FormControl>
            <LeadChannelSelect value={leadChannel} onChange={setLeadChannel} id="wd-channel" />
            <FormControl>
              <InputLabel id="wd-status">Status</InputLabel>
              <Select labelId="wd-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value as WhDomain['status'])}>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="paused">Paused (reject leads)</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Panel>

        <Panel
          title={`Forms / webhooks (${hooks.length})`}
          action={<Button size="small" startIcon={<Add />} onClick={() => { setNewForm(''); setAddOpen(true); }}>Add another form</Button>}
        >
          {allHooks === undefined ? <CircularProgress size={24} /> : !hooks.length ? (
            <Typography variant="body2" color="text.secondary">No forms yet. Click "Add another form" to get a webhook address and the form code.</Typography>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Form</TableCell><TableCell>Flow</TableCell><TableCell>Last lead</TableCell><TableCell>Status</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {hooks.map((w) => (
                    <TableRow key={w.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/wh/webhooks/${w.id}`)}>
                      <TableCell sx={{ fontWeight: 600 }}>{w.formName}</TableCell>
                      <TableCell>{flowName(w.flowId)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{ago(w.lastReceivedAt, now)}</TableCell>
                      <TableCell><StatusChip status={w.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Panel>

        <Panel title="Leads per day (last 30 days)">
          {stats === undefined ? <CircularProgress size={24} /> : <DayBars data={series} height={180} />}
        </Panel>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontSize: 18 }}>Settings for this website</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These apply to every form on this website. Leave a setting empty to use the global default (shown in grey).
            A form's own flow or webhook settings can still override them.
          </Typography>
          <SettingsForm value={settings} onChange={setSettings} inherited={resolveSettings(global || undefined, master?.settings)} scope="domain" />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" startIcon={<Save />} onClick={save} disabled={!dirty || !!busy}>Save</Button>
          </Box>
        </Paper>

        <Panel title="Recent leads" action={<Button size="small" component={RouterLink} to={`/wh/submissions?domain=${domain.id}`}>All leads</Button>}>
          <RecentSubmissions field="domainId" id={domain.id} formName={(id) => hooks.find((w) => w.id === id)?.formName || ''} />
        </Panel>

        {isAdmin && (
          <Paper sx={{ p: 2, borderColor: 'error.main' }} variant="outlined">
            <Typography variant="h6" sx={{ fontSize: 18 }}>Delete website</Typography>
            {hooks.length ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                This website still has {hooks.length} form(s). Delete them first, or pause the website instead (leads are rejected, history is kept).
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Removes the website. Past leads stay in Submissions.</Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {hooks.length > 0 && status === 'active' && (
                <Button variant="outlined" startIcon={<Pause />} onClick={() => setDomainStatus('paused')} disabled={!!busy}>Pause instead</Button>
              )}
              <Button color="error" variant="outlined" startIcon={<Delete />} onClick={del} disabled={hooks.length > 0 || !!busy}>Delete website</Button>
            </Box>
          </Paper>
        )}
      </Stack>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add another form</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each form gets its own webhook address, so you can tell the leads apart. It uses the flow "{flowChoice ? flowName(flowChoice) : '—'}" — you can change it on the next page.
          </Typography>
          <TextField autoFocus fullWidth label="Form name" placeholder="e.g. Trade-in form" value={newForm} onChange={(e) => setNewForm(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={addForm} disabled={busy === 'add'}>{busy === 'add' ? 'Creating…' : 'Create'}</Button>
        </DialogActions>
      </Dialog>
    </WhShell>
  );
};

/** One website: details, settings, forms, stats and recent leads. */
const WhWebsiteDetail: React.FC = () => {
  const { id } = useParams();
  const domain = useWhDoc<WhDomain>(WH.domains, id);
  if (domain === undefined) return <WhShell title="Website"><CircularProgress aria-label="Loading" /></WhShell>;
  if (!domain) return <WhShell title="Website"><Alert severity="warning">This website was not found. <RouterLink to="/wh/websites">Back to websites</RouterLink></Alert></WhShell>;
  return <Editor key={domain.id} domain={domain} />;
};

export default WhWebsiteDetail;
