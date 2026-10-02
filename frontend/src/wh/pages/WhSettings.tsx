import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Link, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import SettingsForm from '../components/SettingsForm';
import Wh2Integrations from '../components/Wh2Integrations';
import GoogleConnections from '../components/GoogleConnections';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { saveWh, useWhCollection, useWhDoc } from '../data';
import { ensureWhDefaults } from '../bootstrap';
import { WH } from '../types';
import type { WhFlow, WhGlobalSettings, WhSettings as Settings } from '../types';

type GlobalDoc = WhGlobalSettings & { id: string; createdAt?: number; updatedAt?: number };
const GLOBAL_ONLY = ['masterFlowId', 'defaultFlowId', 'retentionDays', 'failureSpikePerHour'] as const;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
    <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
    <Typography variant="body2" color="text.secondary" component="div">{children}</Typography>
  </Paper>
);

const WhSettingsPage: React.FC = () => {
  const { profile } = useMp();
  const global = useWhDoc<GlobalDoc>(WH.settings, 'global');
  const { rows: flows } = useWhCollection<WhFlow>(WH.flows);
  // 4 = Google connections (shown first; the other tab numbers stay as they were).
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'general' ? 0 : 4));
  const [draft, setDraft] = useState<GlobalDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = draft !== null;
  const view: GlobalDoc | null = draft || global || null;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const edit = (patch: Partial<GlobalDoc>) => { if (view) { setDraft({ ...view, ...patch }); setMsg(null); } };
  const numOrUndef = (s: string, min: number, max: number) => (s === '' ? undefined : Math.min(max, Math.max(min, Math.round(Number(s) || 0))));

  const setup = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await ensureWhDefaults(profile);
      setMsg({ ok: true, text: 'Defaults created: Master Flow, "Standard lead flow", email templates and global settings.' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!view) return;
    setBusy(true);
    try {
      const { id: _id, ...rest } = view;
      void _id;
      await saveWh(WH.settings, rest as Record<string, unknown>, 'global');
      await writeAudit(profile, 'wh_settings_save', 'wh_settings/global', 'Global Webhook Flows settings updated');
      setDraft(null);
      setMsg({ ok: true, text: 'Settings saved. They apply to new leads right away.' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const settingsOnly = (g: GlobalDoc): Settings => {
    const s = { ...g } as Record<string, unknown>;
    for (const k of [...GLOBAL_ONLY, 'id', 'createdAt', 'updatedAt']) delete s[k];
    return s as Settings;
  };
  const setSettings = (s: Settings) => {
    if (!view) return;
    const keep: Record<string, unknown> = { id: view.id, createdAt: view.createdAt };
    for (const k of GLOBAL_ONLY) keep[k] = view[k];
    setDraft({ ...(s as GlobalDoc), ...keep } as GlobalDoc);
    setMsg(null);
  };

  const masters = (flows || []).filter((f) => f.type === 'master');
  const templates = (flows || []).filter((f) => f.type === 'template');
  const showSave = tab === 0 || tab === 2;

  return (
    <WhShell
      admin
      title="Webhook Flows settings"
      subtitle="Defaults for every website, connections, security and retention. Admins only."
      actions={showSave && view ? <>
        {dirty && <Button color="inherit" onClick={() => setDraft(null)} disabled={busy}>Discard</Button>}
        <Button variant="contained" startIcon={<Save />} onClick={save} disabled={!dirty || busy}>Save</Button>
      </> : undefined}
    >
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value={4} label="Google connections" />
        <Tab value={0} label="General" />
        <Tab value={1} label="Other integrations" />
        <Tab value={2} label="Security & retention" />
        <Tab value={3} label="Realtime" />
      </Tabs>
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {(tab === 0 || tab === 2) && global === undefined && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>}
      {(tab === 0 || tab === 2) && global === null && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={setup} disabled={busy}>Set up defaults</Button>}>
          Webhook Flows isn&apos;t set up yet. &quot;Set up defaults&quot; creates the global settings, the Master Flow, a &quot;Standard lead flow&quot; and two email templates.
        </Alert>
      )}

      {tab === 0 && view && (
        <Stack spacing={2}>
          {(!view.masterFlowId || !view.defaultFlowId || !masters.length) && (
            <Alert severity="warning" action={<Button color="inherit" onClick={setup} disabled={busy}>Set up defaults</Button>}>
              Some defaults are missing (Master Flow or default flow). &quot;Set up defaults&quot; creates only what&apos;s missing.
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Flows</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField select size="small" label="Master Flow" value={view.masterFlowId || ''} sx={{ flex: 1 }}
                onChange={(e) => edit({ masterFlowId: e.target.value || undefined })}
                helperText="Runs for every lead from every website, after its own flow.">
                <MenuItem value="">None</MenuItem>
                {masters.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Default flow for new websites" value={view.defaultFlowId || ''} sx={{ flex: 1 }}
                onChange={(e) => edit({ defaultFlowId: e.target.value || undefined })}
                helperText="&quot;Add website&quot; connects new forms to this template flow.">
                <MenuItem value="">None</MenuItem>
                {templates.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField size="small" type="number" label="Alert when step failures per hour exceed" sx={{ mt: 2, maxWidth: 360 }} fullWidth
              value={view.failureSpikePerHour ?? ''} placeholder="20"
              onChange={(e) => edit({ failureSpikePerHour: numOrUndef(e.target.value, 0, 100000) })}
              helperText="Admins get an alert when more steps than this fail in one hour (e.g. an email login stopped working). 0 = off. Default 20." />
            <Box sx={{ mt: 1 }}><Link component={RouterLink} to="/wh/flows">Edit flows →</Link></Box>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Global defaults</Typography>
            <SettingsForm value={settingsOnly(view)} onChange={setSettings} scope="global" />
          </Paper>
        </Stack>
      )}

      {tab === 4 && <GoogleConnections />}
      {tab === 1 && <Wh2Integrations />}

      {tab === 2 && (
        <Box>
          {view && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Retention</Typography>
              <TextField size="small" type="number" label="Delete submissions older than (days)" value={view.retentionDays ?? ''} placeholder="365"
                sx={{ maxWidth: 360 }} fullWidth onChange={(e) => edit({ retentionDays: numOrUndef(e.target.value, 0, 3650) })}
                helperText="Old submissions, their step logs and uploaded images are deleted nightly. 0 = keep forever. Leads already copied to the CRM, sheets or DMS are not affected." />
            </Paper>
          )}
          <Section title="Unguessable webhook addresses">
            Every form posts to https://tigoniot.com/hooks/&lt;key&gt; where the key is 32 random characters — it can&apos;t be guessed.
            If a key leaks, open the webhook and choose &quot;Change key&quot; (then update the website).
          </Section>
          <Section title="Signed requests (HMAC, optional per webhook)">
            For websites that post from a server, turn on &quot;Require signature&quot; on the webhook: each request must carry
            X-Tigon-Signature: sha256=&lt;HMAC of the body&gt;. Unsigned requests are rejected.
          </Section>
          <Section title="Rate limits and spam protection">
            Per visitor (IP) and per form limits, a hidden spam-trap field, optional Cloudflare Turnstile, blocked IPs and blocked words.
            Set them in General → Validation &amp; spam (and override per website, flow or webhook).
          </Section>
          <Section title="Credentials">
            Firestore encrypts all data at rest. Passwords and API keys for connections are stored separately, are write-only from the app
            (nobody can read them back — not even admins) and are used only by the TIGON IOT Cloud Functions.
          </Section>
          <Section title="Uploaded images">
            Forms may upload up to 3 images. Only real images (JPEG, PNG, GIF, WebP, HEIC) up to 10 MB each are accepted; they are stored privately
            and visible only to signed-in staff.
          </Section>
          <Section title="Who can do what">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li><b>Managers</b>: websites, webhooks, flows (except the Master Flow), email templates, reviewing submissions.</li>
              <li><b>Admins</b>: everything above plus these settings, integrations (connections) and the Master Flow.</li>
              <li><b>Sales</b>: no access to Webhook Flows (they receive leads in the CRM and notifications).</li>
            </ul>
            Roles are changed in <Link component={RouterLink} to="/mp/profiles">MP Assistant → Profiles</Link>.
          </Section>
          <Section title="Audit log">
            Changes to websites, webhooks, flows, templates and settings are recorded (who, what, when) in the admin audit log —
            see <Link component={RouterLink} to="/mp/accounts">MP Assistant → Accounts → Audit log</Link>. Every step run for every lead is logged on the submission page.
          </Section>
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <Section title="How fast leads are processed">
            New leads are saved instantly (the website gets its answer right away) and then processed — emails, sheets, DMS — within about a minute.
          </Section>
          <Section title="Instant processing (optional)">
            An admin can turn on instant processing: in GitHub, set the repository variable <b>WH_REALTIME</b> to <b>true</b>
            (Settings → Secrets and variables → Actions → Variables), then run the deploy. Leads are then processed within seconds.
            The one-minute processor keeps running as a safety net for retries and delays.
          </Section>
        </Box>
      )}
    </WhShell>
  );
};

export default WhSettingsPage;
