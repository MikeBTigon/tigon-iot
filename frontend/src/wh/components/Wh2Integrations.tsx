import React, { useState } from 'react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, MenuItem, Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Delete, Edit, Send } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { callWh, fmtTime, patchWh, removeWh, saveWh, useWhCollection, useWhDoc } from '../data';
import { WH } from '../types';
import type { IntegrationType, WhIntegration } from '../types';

const SERVICE_ACCOUNT = '470095494000-compute@developer.gserviceaccount.com';

const TYPE_LABEL: Record<IntegrationType, string> = {
  smtp: 'Email sending (SMTP)', google_sheets: 'Google Sheets', dms: 'DMS (dealer management system)', ga4: 'Google Analytics 4',
};

type Provider = 'postmark' | 'sendgrid' | 'ses' | 'gmail' | 'custom';
const PROVIDERS: Record<Provider, { label: string; host: string; port: number; secure: boolean; user: string; pass: string }> = {
  gmail: { label: 'Gmail / Google Workspace (app password)', host: 'smtp.gmail.com', port: 465, secure: true,
    user: 'The full address, e.g. tigon-worker@tigongolfcarts.com', pass: 'The 16-letter app password from Google (spaces are fine)' },
  postmark: { label: 'Postmark', host: 'smtp.postmarkapp.com', port: 587, secure: false,
    user: '', pass: 'Postmark → your server → API Tokens → Server API token (used as both SMTP username and password)' },
  sendgrid: { label: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false,
    user: '', pass: 'SendGrid → Settings → API Keys → Create (Mail Send permission). The SMTP username "apikey" is filled in for you.' },
  ses: { label: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false,
    user: 'SES SMTP username (SES console → SMTP settings → Create SMTP credentials)', pass: 'SES SMTP password (not your AWS password)' },
  custom: { label: 'Other SMTP server', host: '', port: 587, secure: false, user: 'SMTP username', pass: 'SMTP password' },
};

/** Step-by-step: getting a Google app password for a Gmail account. */
const GmailSteps: React.FC = () => (
  <Alert severity="info" sx={{ '& ol': { pl: 2.5, my: 0.5 }, '& li': { mb: 0.5 } }}>
    <b>How to get a Gmail app password</b> (takes about 2 minutes)
    <ol>
      <li>Sign in to Google as the account that will send the emails (e.g. tigon-worker@tigongolfcarts.com).</li>
      <li>
        Turn on <b>2-Step Verification</b> if it isn't on yet:{' '}
        <a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer">myaccount.google.com/signinoptions/twosv</a>.
        App passwords only exist when 2-Step Verification is on.
      </li>
      <li>
        Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>{' '}
        (or Google Account → Security → search "App passwords").
      </li>
      <li>Type a name such as <b>TIGON IOT Webhook Flows</b> and click <b>Create</b>.</li>
      <li>Google shows a 16-letter password (like <code>abcd efgh ijkl mnop</code>). Copy it into <b>App password</b> below — it's shown only once.</li>
      <li>Enter the same address in <b>Gmail / Workspace address</b>, click <b>Save</b>, then press <b>Test</b> on the connection.</li>
    </ol>
    <b>Google Workspace address</b> (e.g. tigon-worker@tigongolfcarts.com) — same steps, plus once, as a Workspace admin at{' '}
    <a href="https://admin.google.com" target="_blank" rel="noreferrer">admin.google.com</a>: Security → Authentication →
    2-step verification → tick <b>Allow users to turn on 2-Step Verification</b> → Save. Then sign in as that user and do
    steps 2–6. For best delivery, make sure Gmail → Authenticate email (DKIM) is turned on for your domain in the Admin console.
    <br />
    Good to know: emails are sent <b>from</b> this address (Google replaces any other "From"). Replies to lead emails still
    go to the customer. Limits: about <b>500 emails a day</b> for @gmail.com, about <b>2,000</b> for Workspace. If the
    account's password changes or the app password is removed, create a new one and paste it here.
  </Alert>
);

interface Editing {
  id?: string;
  type: IntegrationType;
  name: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  credentialsSetAt?: number;
}

const SECRET_KEYS: Record<IntegrationType, string[]> = {
  smtp: ['user', 'pass', 'token', 'apiKey'], dms: ['headerName', 'headerValue', 'basicUser', 'basicPass'], google_sheets: [], ga4: [],
};

/** Secret fields written for an SMTP provider: Postmark {token}, SendGrid {apiKey}, others {user, pass}. */
const smtpSecretKeys = (p: string) => (p === 'postmark' ? ['token'] : p === 'sendgrid' ? ['apiKey'] : ['user', 'pass']);

const IntegrationDialog: React.FC<{ value: Editing; smtpList: WhIntegration[]; onClose: () => void }> = ({ value, smtpList, onClose }) => {
  const { profile } = useMp();
  const [v, setV] = useState<Editing>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = v.config;
  const cs = (k: string) => (c[k] === undefined || c[k] === null ? '' : String(c[k]));
  const setC = (patch: Record<string, unknown>) => setV({ ...v, config: { ...v.config, ...patch } });
  const setS = (k: string, val: string) => setV({ ...v, secrets: { ...v.secrets, [k]: val } });
  const secretPh = v.credentialsSetAt ? `••• saved on ${fmtTime(v.credentialsSetAt)} (leave empty to keep)` : '';
  const secretField = (k: string, label: string, help: string, password = true) => (
    <TextField key={k} size="small" label={label} type={password ? 'password' : 'text'} autoComplete="new-password"
      value={v.secrets[k] || ''} onChange={(e) => setS(k, e.target.value)} placeholder={secretPh} helperText={help}
      slotProps={{ inputLabel: { shrink: true } }} />
  );

  const applyProvider = (p: Provider) => {
    const pr = PROVIDERS[p];
    const host = p === 'ses' ? `email-smtp.${cs('region') || 'us-east-1'}.amazonaws.com` : pr.host;
    setV({
      ...v, config: { ...v.config, provider: p, host, port: pr.port, secure: pr.secure, ...(p === 'ses' && !c.region ? { region: 'us-east-1' } : {}) },
      secrets: {},
    });
  };

  const save = async () => {
    if (!v.name.trim()) { setError('Give the connection a name.'); return; }
    if (v.type === 'smtp' && c.provider === 'gmail') {
      if (!/^\S+@\S+\.\S+$/.test(cs('fromEmail'))) { setError('Enter the Gmail address that sends the emails.'); return; }
      if (!v.credentialsSetAt && !(v.secrets.pass || '').trim()) { setError('Paste the Google app password (see the steps above).'); return; }
      if (v.secrets.pass && v.secrets.pass.replace(/\s+/g, '').length !== 16) {
        setError('A Google app password is 16 letters (e.g. "abcd efgh ijkl mnop"). Check that you copied all of it.'); return;
      }
    }
    if (v.type === 'smtp') {
      if (!cs('host') || !Number(c.port)) { setError('Enter the SMTP server and port.'); return; }
      if (!/^\S+@\S+\.\S+$/.test(cs('fromEmail'))) { setError('Enter the "From" email address (it must be verified with your provider).'); return; }
    }
    if (v.type === 'dms') {
      if ((c.delivery || 'http') === 'http' && !/^https:\/\//i.test(cs('url'))) { setError('Enter the DMS URL (https://…).'); return; }
      if (c.delivery === 'email' && !/^\S+@\S+\.\S+$/.test(cs('emailTo'))) { setError('Enter the DMS lead email address.'); return; }
    }
    setBusy(true);
    setError('');
    try {
      const allowed = v.type === 'smtp' ? smtpSecretKeys(String(c.provider || 'custom')) : SECRET_KEYS[v.type];
      const gmail = v.type === 'smtp' && c.provider === 'gmail';
      const raw = gmail && v.secrets.pass ? { ...v.secrets, user: cs('fromEmail'), pass: v.secrets.pass.replace(/\s+/g, '') } : v.secrets;
      const secrets = Object.fromEntries(Object.entries(raw).filter(([k, s]) => allowed.includes(k) && s.trim() !== '').map(([k, s]) => [k, s.trim()]));
      const body: Record<string, unknown> = { type: v.type, name: v.name.trim(), config: v.config };
      if (v.credentialsSetAt) body.credentialsSetAt = v.credentialsSetAt;
      if (value.id) body.createdAt = (value as Editing & { createdAt?: number }).createdAt;
      const id = await saveWh(WH.integrations, body, v.id);
      if (Object.keys(secrets).length) {
        const now = Date.now();
        await setDoc(doc(db, WH.integrationSecrets, id), { ...secrets, updatedAt: now }, { merge: true });
        await patchWh(WH.integrations, id, { credentialsSetAt: now });
      }
      await writeAudit(profile, v.id ? 'wh_integration_update' : 'wh_integration_create', `wh_integrations/${id}`,
        `${v.name} (${v.type})${Object.keys(secrets).length ? `, credentials updated: ${Object.keys(secrets).join(', ')}` : ''}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const provider = (cs('provider') || 'custom') as Provider;

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{v.id ? 'Edit connection' : 'Add connection'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Type" value={v.type} disabled={!!v.id} size="small"
            onChange={(e) => setV({ ...v, type: e.target.value as IntegrationType, config: {}, secrets: {} })}>
            {(Object.keys(TYPE_LABEL) as IntegrationType[]).map((t) => <MenuItem key={t} value={t}>{TYPE_LABEL[t]}</MenuItem>)}
          </TextField>
          <TextField label="Name" size="small" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })}
            helperText="Shown in settings, e.g. &quot;Gmail – tigongolfcarts@gmail.com&quot;" />

          {v.type === 'smtp' && <>
            <TextField select size="small" label="Provider" value={provider} onChange={(e) => applyProvider(e.target.value as Provider)}
              helperText="Choosing a provider fills in the server details.">
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => <MenuItem key={p} value={p}>{PROVIDERS[p].label}</MenuItem>)}
            </TextField>
            {provider === 'gmail' && <GmailSteps />}
            {provider === 'ses' && (
              <TextField size="small" label="AWS region" value={cs('region')} placeholder="us-east-1"
                onChange={(e) => setC({ region: e.target.value.trim(), host: `email-smtp.${e.target.value.trim() || 'us-east-1'}.amazonaws.com` })} />
            )}
            {provider !== 'gmail' && <><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField size="small" label="SMTP server" value={cs('host')} onChange={(e) => setC({ host: e.target.value.trim() })} sx={{ flexGrow: 1 }} />
              <TextField size="small" label="Port" type="number" value={cs('port')} sx={{ width: 110 }} onChange={(e) => setC({ port: Number(e.target.value) || '' })} />
            </Stack>
            <FormControlLabel control={<Switch checked={!!c.secure} onChange={(e) => setC({ secure: e.target.checked })} />}
              label="Use SSL from the start (port 465). Off = STARTTLS (port 587)." />
            </>}
            {provider === 'gmail' ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField size="small" label="Gmail / Workspace address" value={cs('fromEmail')} placeholder="tigon-worker@tigongolfcarts.com"
                  onChange={(e) => { const em = e.target.value.trim(); setV({ ...v, config: { ...v.config, fromEmail: em }, secrets: { ...v.secrets, user: em } }); }}
                  helperText="Emails are sent from this address" sx={{ flexGrow: 1 }} />
                <TextField size="small" label="From name" value={cs('fromName')} placeholder="TIGON Golf Carts"
                  onChange={(e) => setC({ fromName: e.target.value })} sx={{ flexGrow: 1 }} />
              </Stack>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField size="small" label="From email" value={cs('fromEmail')} onChange={(e) => setC({ fromEmail: e.target.value.trim() })}
                  helperText="Must be verified with the provider" sx={{ flexGrow: 1 }} />
                <TextField size="small" label="From name" value={cs('fromName')} onChange={(e) => setC({ fromName: e.target.value })} sx={{ flexGrow: 1 }} />
              </Stack>
            )}
            <Typography variant="subtitle2">Login (write-only)</Typography>
            {provider === 'gmail' && secretField('pass', 'App password', PROVIDERS.gmail.pass)}
            {provider === 'postmark' && secretField('token', 'Server API token', PROVIDERS.postmark.pass)}
            {provider === 'sendgrid' && secretField('apiKey', 'API key', PROVIDERS.sendgrid.pass)}
            {provider !== 'postmark' && provider !== 'sendgrid' && provider !== 'gmail' && <>
              {secretField('user', 'Username', PROVIDERS[provider].user, false)}
              {secretField('pass', 'Password', PROVIDERS[provider].pass)}
            </>}
            {!!v.credentialsSetAt && (
              <Typography variant="caption" color="text.secondary">After switching provider, enter the login again.</Typography>
            )}
          </>}

          {v.type === 'google_sheets' && <>
            <Alert severity="info">
              Google Sheets uses the TIGON IOT server account — no password needed. One-time: enable the <b>Google Sheets API</b> in
              the tigon-iot Google Cloud project. For each sheet: click <b>Share</b> and add <b>{SERVICE_ACCOUNT}</b> as <b>Editor</b>.
            </Alert>
            <TextField size="small" label="Note (optional)" value={cs('note')} onChange={(e) => setC({ note: e.target.value })} multiline minRows={2} />
          </>}

          {v.type === 'ga4' && (
            <Alert severity="info">
              Nothing to set here. Each website&apos;s Measurement ID and API secret go in its settings (Google Analytics section), or in the global settings.
            </Alert>
          )}

          {v.type === 'dms' && <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField select size="small" label="Lead format" value={cs('format') || 'adf'} onChange={(e) => setC({ format: e.target.value })} sx={{ flexGrow: 1 }}>
                <MenuItem value="adf">ADF / XML (standard for dealer systems)</MenuItem>
                <MenuItem value="json">JSON</MenuItem>
              </TextField>
              <TextField select size="small" label="Delivery" value={cs('delivery') || 'http'} onChange={(e) => setC({ delivery: e.target.value })} sx={{ flexGrow: 1 }}>
                <MenuItem value="http">Send to a web address (HTTP POST)</MenuItem>
                <MenuItem value="email">Send by email</MenuItem>
              </TextField>
            </Stack>
            {(cs('delivery') || 'http') === 'http' ?
              <TextField size="small" label="DMS URL" value={cs('url')} placeholder="https://…" onChange={(e) => setC({ url: e.target.value.trim() })} /> :
              <Stack spacing={1.5}>
                <TextField size="small" label="DMS lead email address" value={cs('emailTo')} onChange={(e) => setC({ emailTo: e.target.value.trim() })} />
                <TextField select size="small" label="Send using" value={cs('smtpIntegrationId')} onChange={(e) => setC({ smtpIntegrationId: e.target.value || undefined })}
                  helperText="Which email connection sends the ADF email.">
                  <MenuItem value="">The email connection from global settings</MenuItem>
                  {smtpList.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
                </TextField>
              </Stack>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField size="small" label="Vendor name (ADF)" value={cs('vendorName')} onChange={(e) => setC({ vendorName: e.target.value })} sx={{ flexGrow: 1 }}
                helperText="The dealership name the DMS expects" />
              <TextField size="small" label="Provider name (ADF)" value={cs('providerName')} onChange={(e) => setC({ providerName: e.target.value })} sx={{ flexGrow: 1 }}
                helperText="Lead source, e.g. TIGON IOT" />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField size="small" label="Provider website (ADF, optional)" value={cs('providerUrl')} onChange={(e) => setC({ providerUrl: e.target.value.trim() || undefined })}
                placeholder="https://tigoniot.com" sx={{ flexGrow: 1 }} />
              <TextField select size="small" label="Vehicle status (ADF)" value={cs('vehicleStatus') || 'new'} onChange={(e) => setC({ vehicleStatus: e.target.value })} sx={{ minWidth: 160 }}>
                <MenuItem value="new">New</MenuItem>
                <MenuItem value="used">Used</MenuItem>
              </TextField>
            </Stack>
            <FormControlLabel control={<Switch checked={!!c.sendTests} onChange={(e) => setC({ sendTests: e.target.checked })} />}
              label="Also send test leads (from “Send test lead”) to the DMS" />
            {(cs('delivery') || 'http') === 'http' && <>
              <Typography variant="subtitle2">Authentication (write-only, all optional)</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                {secretField('headerName', 'Header name', 'e.g. Authorization or X-Api-Key', false)}
                {secretField('headerValue', 'Header value', 'e.g. Bearer abc123')}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                {secretField('basicUser', 'Basic auth user', 'If the DMS uses a username/password', false)}
                {secretField('basicPass', 'Basic auth password', '')}
              </Stack>
            </>}
          </>}
          {SECRET_KEYS[v.type].length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Logins are stored separately and can&apos;t be read back by anyone in the app — only the TIGON IOT servers use them.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

interface SheetsStatus { id: string; lastFlushAt?: number; lastFlushRows?: number; lastError?: string; lastErrorAt?: number; pendingRows?: number; deadRows?: number }

/** Settings → Integrations tab: email, Sheets, DMS and GA4 connections. */
const Wh2Integrations: React.FC = () => {
  const { profile } = useMp();
  const { rows, error } = useWhCollection<WhIntegration>(WH.integrations);
  const sheets = useWhDoc<SheetsStatus>(WH.settings, 'sheets_status');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [testing, setTesting] = useState<WhIntegration | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState('');

  const startTest = (i: WhIntegration) => { setTesting(i); setTestTo(profile?.email || ''); setTestMsg(null); };
  const runTest = async () => {
    if (!testing) return;
    setTestBusy(true);
    setTestMsg(null);
    try {
      await callWh('whTestEmail', { integrationId: testing.id, to: testTo.trim(), subject: 'Test', htmlBody: '<p>It works.</p>', textBody: 'It works.' });
      setTestMsg({ ok: true, text: `Sent to ${testTo}. Check the inbox (and spam folder).` });
    } catch (e) { setTestMsg({ ok: false, text: (e as Error).message }); } finally { setTestBusy(false); }
  };

  const remove = async (i: WhIntegration) => {
    if (!window.confirm(`Delete "${i.name}"? Settings that use it will stop sending until another connection is chosen.`)) return;
    try {
      await removeWh(WH.integrations, i.id);
      await deleteDoc(doc(db, WH.integrationSecrets, i.id)).catch(() => undefined);
      await writeAudit(profile, 'wh_integration_delete', `wh_integrations/${i.id}`, i.name);
    } catch (e) { setMsg((e as Error).message); }
  };

  const list = [...(rows || [])].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const summary = (i: WhIntegration) => {
    const c = i.config || {};
    if (i.type === 'smtp') return `${String(c.host || '?')}:${String(c.port || '')} · from ${String(c.fromEmail || '?')}`;
    if (i.type === 'dms') return `${String(c.format || 'adf').toUpperCase()} by ${c.delivery === 'email' ? `email to ${String(c.emailTo || '?')}` : String(c.url || '?')}`;
    if (i.type === 'google_sheets') return String(c.note || `Share sheets with ${SERVICE_ACCOUNT}`);
    return 'Measurement IDs are set per website';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Connections to email providers, Google Sheets and your DMS. Pick them in settings (global, website, flow or webhook).
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setEditing({ type: 'smtp', name: '', config: { provider: 'gmail', host: 'smtp.gmail.com', port: 465, secure: true }, secrets: {} })}>
          Add connection
        </Button>
      </Box>
      {(error || msg) && <Alert severity="error" sx={{ mb: 2 }}>{error || msg}</Alert>}
      {rows === undefined && <CircularProgress aria-label="Loading" />}
      <Stack spacing={1}>
        {list.map((i) => (
          <Paper key={i.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ flexGrow: 1, minWidth: 200 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>{i.name}</Typography>
                <Chip size="small" variant="outlined" label={TYPE_LABEL[i.type] || i.type} />
                {SECRET_KEYS[i.type]?.length > 0 && (
                  i.credentialsSetAt ?
                    <Chip size="small" color="success" variant="outlined" label={`Login saved ${fmtTime(i.credentialsSetAt)}`} /> :
                    i.type === 'smtp' ? <Chip size="small" color="warning" label="No login saved" /> : null
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{summary(i)}</Typography>
            </Box>
            {i.type === 'smtp' && <Button size="small" startIcon={<Send />} onClick={() => startTest(i)}>Test</Button>}
            <Tooltip title="Edit"><IconButton aria-label="Edit" onClick={() => setEditing({ ...i, secrets: {} })}><Edit /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton aria-label="Delete" onClick={() => remove(i)}><Delete /></IconButton></Tooltip>
          </Paper>
        ))}
        {rows && !rows.length && (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">No connections yet. Start with an email connection (SMTP) so lead emails can be sent.</Typography>
          </Paper>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
        <Typography sx={{ fontWeight: 600 }}>Google Sheets</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Enable the Google Sheets API in the tigon-iot Google Cloud project once. Then share each sheet (Share → Editor) with{' '}
          <b style={{ wordBreak: 'break-all' }}>{SERVICE_ACCOUNT}</b>. Rows are written in batches about every minute.
        </Typography>
        {sheets === undefined ? <CircularProgress size={18} /> : !sheets ? (
          <Typography variant="body2" color="text.secondary">No rows written yet.</Typography>
        ) : (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Chip size="small" label={`Last write: ${fmtTime(sheets.lastFlushAt)}${sheets.lastFlushRows !== undefined ? ` (${sheets.lastFlushRows} rows)` : ''}`} />
            <Chip size="small" color={sheets.pendingRows ? 'info' : 'default'} label={`Waiting: ${sheets.pendingRows ?? 0} rows`} />
            <Chip size="small" color={sheets.deadRows ? 'error' : 'default'} label={`Failed for good: ${sheets.deadRows ?? 0} rows`} />
          </Stack>
        )}
        {sheets?.lastError && (!sheets.lastFlushAt || (sheets.lastErrorAt || 0) > sheets.lastFlushAt) && (
          <Alert severity="error" sx={{ mt: 1 }}>Last error ({fmtTime(sheets.lastErrorAt)}): {sheets.lastError}</Alert>
        )}
      </Paper>

      {editing && <IntegrationDialog key={editing.id || 'new'} value={editing} smtpList={(rows || []).filter((r) => r.type === 'smtp')} onClose={() => setEditing(null)} />}

      <Dialog open={!!testing} onClose={() => !testBusy && setTesting(null)} fullWidth maxWidth="xs">
        <DialogTitle>Send a test email</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Sends a short email through “{testing?.name}”.</Typography>
          <TextField fullWidth size="small" label="To" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          {testMsg && <Alert severity={testMsg.ok ? 'success' : 'error'} sx={{ mt: 2 }}>{testMsg.text}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTesting(null)} disabled={testBusy}>Close</Button>
          <Button variant="contained" onClick={runTest} disabled={testBusy || !testTo.trim()} startIcon={testBusy ? <CircularProgress size={16} /> : <Send />}>Send</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Wh2Integrations;
