import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Checkbox, FormControlLabel, List, ListItem, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { Download, Key, PlayArrow } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { callWh, hookUrl, patchWh } from '../data';
import { randomKey } from '../shared';
import { WH } from '../types';
import type { WhDomain, WhSettings, WhWebhook } from '../types';
import {
  GA4_CHECKLIST, aiPrompt, curlExamples, embedSnippet, existingFormSnippet, fieldReference, platformLabel, platformTips,
  setupPacketText,
} from '../snippet';
import type { SnippetOptions } from '../snippet';
import { downloadFile } from '../csv';
import { CodeBlock, CopyButton } from './Wh1Code';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Everything a website owner (or their web person) needs to connect a form: endpoint, copy-paste code,
 * field reference, developer examples, GA4 checklist, a test button and an AI prompt.
 */
const SetupPacket: React.FC<{ webhook: WhWebhook; domain?: WhDomain | null; settings: WhSettings }> = ({ webhook, domain, settings }) => {
  const { profile } = useMp();
  const [tab, setTab] = useState(0);
  const [variant, setVariant] = useState<'embed' | 'existing'>('embed');
  const [existingId, setExistingId] = useState('my-contact-form');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [test, setTest] = useState<Record<string, unknown> | null>(null);
  const [ga, setGa] = useState<Record<string, boolean>>({});

  const opts: SnippetOptions = useMemo(() => ({
    key: webhook.key,
    formName: webhook.formName,
    siteName: domain?.name,
    siteUrl: domain?.url,
    platform: domain?.platform,
    honeypot: settings.spam?.honeypotField,
    thankYouUrl: settings.thankYouUrl,
    required: settings.requiredFields,
    fieldMap: webhook.fieldMap,
    hmacRequired: webhook.hmacRequired,
    ga4MeasurementId: settings.ga4MeasurementId,
  }), [webhook, domain, settings]);

  const url = hookUrl(webhook.key);
  const code = variant === 'embed' ? embedSnippet(opts) : existingFormSnippet(opts, existingId);
  const curl = curlExamples(opts);
  const refs = fieldReference(settings.requiredFields);

  const rotateSecret = async () => {
    if (webhook.hmacRequired && !window.confirm('Create a new signing secret? The old secret stops working right away — every system that signs requests must be updated.')) return;
    setBusy('secret');
    setError('');
    try {
      const s = randomKey(40);
      await setDoc(doc(db, WH.integrationSecrets, `webhook_${webhook.id}`), { secret: s, setAt: Date.now() });
      await patchWh(WH.webhooks, webhook.id, { hmacRequired: true });
      await writeAudit(profile, 'wh_webhook_secret', webhook.formName, `webhook ${webhook.id}: signing secret set, signature required`);
      setSecret(s);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy('');
    }
  };

  const runTest = async () => {
    setBusy('test');
    setError('');
    setTest(null);
    try {
      const res = await callWh<Record<string, unknown>>('whTestWebhook', { webhookId: webhook.id });
      setTest(res && typeof res === 'object' ? res : { result: res });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy('');
    }
  };

  const download = () => {
    const name = `${(domain?.name || 'website').replace(/[^\w-]+/g, '-')}-${webhook.formName.replace(/[^\w-]+/g, '-')}-setup.md`.toLowerCase();
    downloadFile(name, setupPacketText(opts, existingId), 'text/markdown;charset=utf-8');
  };

  const testSubmissionId = test && typeof test.submissionId === 'string' ? test.submissionId : '';

  return (
    <Paper sx={{ p: 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Setup packet</Typography>
        <Button size="small" variant="outlined" startIcon={<Download />} onClick={download}>Download setup packet</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Send this to whoever manages the website. The form posts every lead to this address:
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, mb: 1 }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', flexGrow: 1 }}>{url}</Typography>
        <CopyButton text={url} label="Copy URL" />
      </Box>
      <Typography variant="caption" color="text.secondary">Keep this address private — anyone who has it can send leads to this form.</Typography>
      {webhook.status === 'paused' && <Alert severity="warning" sx={{ mt: 1 }}>This webhook is paused — leads sent to it are rejected until it is activated.</Alert>}
      {error && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mt: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Website code" />
        <Tab label="Fields" />
        <Tab label="Developers" />
        <Tab label="Google Analytics" />
        <Tab label="Test" />
        <Tab label="AI helper prompt" />
      </Tabs>

      <Box sx={{ pt: 2, minWidth: 0 }}>
        {tab === 0 && (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant={variant === 'embed' ? 'contained' : 'outlined'} size="small" onClick={() => setVariant('embed')}>Ready-made form</Button>
              <Button variant={variant === 'existing' ? 'contained' : 'outlined'} size="small" onClick={() => setVariant('existing')}>Use my existing form</Button>
            </Box>
            <Alert severity="info">
              <b>{platformLabel(domain?.platform)}:</b>
              <List dense disablePadding sx={{ listStyle: 'disc', pl: 2 }}>
                {platformTips(domain?.platform).map((t) => <ListItem key={t} sx={{ display: 'list-item', px: 0 }}>{t}</ListItem>)}
              </List>
            </Alert>
            {variant === 'embed' ? (
              <Typography variant="body2" color="text.secondary">
                A complete form (name, email, phone, ZIP, model, comments and 3 optional photos) with a hidden spam trap and
                automatic tracking (page, referrer, UTM tags, Google/Facebook click ids, GA client id). Paste it where the form should appear.
              </Typography>
            ) : (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Keeps your current form and design. Give the form an id, enter it here, and paste this script once on the same page.
                  Its fields should use the standard names (see "Fields"), or map your names on this webhook's "Field names" section.
                </Typography>
                <TextField size="small" label="Your form's id" value={existingId} onChange={(e) => setExistingId(e.target.value.replace(/\s/g, ''))} sx={{ maxWidth: 320 }} />
              </Stack>
            )}
            <CodeBlock code={code} />
          </Stack>
        )}

        {tab === 1 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Field name</TableCell><TableCell>Label</TableCell><TableCell>Example</TableCell>
                  <TableCell>Required</TableCell><TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {refs.map((r, i) => (
                  <React.Fragment key={r.field}>
                    {(i === 0 || refs[i - 1].group !== r.group) && (
                      <TableRow><TableCell colSpan={5} sx={{ fontWeight: 700, bgcolor: 'action.hover' }}>{r.group === 'Lead' ? 'Lead fields' : 'Tracking fields (filled automatically)'}</TableCell></TableRow>
                    )}
                    <TableRow>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{r.field}</TableCell>
                      <TableCell>{r.label}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', maxWidth: 220, wordBreak: 'break-word' }}>{r.example}</TableCell>
                      <TableCell>{r.required ? 'Yes' : ''}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', minWidth: 200 }}>{r.notes}</TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Spam trap: a hidden input named <code>{settings.spam?.honeypotField || 'website'}</code> must be sent empty.
              Other field names are kept too (shown as extra fields).
            </Typography>
          </Box>
        )}

        {tab === 2 && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              POST <b>multipart/form-data</b> (needed for photos), <b>application/x-www-form-urlencoded</b> or <b>JSON</b>. A good request returns HTTP 200 <code>{'{"ok":true}'}</code>.
            </Typography>
            <Typography variant="subtitle2">Form post (with a photo)</Typography>
            <CodeBlock code={curl.form} maxHeight={240} />
            <Typography variant="subtitle2">JSON</Typography>
            <CodeBlock code={curl.json} maxHeight={200} />
            <Typography variant="subtitle2">Request signing (HMAC)</Typography>
            <Typography variant="body2" color="text.secondary">
              {webhook.hmacRequired ?
                'This webhook requires a signature: every request must carry X-Tigon-Signature: sha256=<HMAC-SHA256 of the raw body, hex>. Browser forms cannot sign, so only use this for server-to-server posts.' :
                'Optional, for server-to-server posts: turn on signing so only systems that know the secret can post. Website forms cannot sign — don\'t turn this on for a form embedded on a website.'}
            </Typography>
            <Box>
              <Button variant="outlined" startIcon={<Key />} onClick={rotateSecret} disabled={busy === 'secret'}>
                {webhook.hmacRequired ? 'Create a new secret (rotate)' : 'Create secret and require signature'}
              </Button>
            </Box>
            {secret && (
              <Alert severity="warning">
                <Typography variant="body2" sx={{ mb: 1 }}><b>Copy this secret now — it will not be shown again.</b></Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{secret}</Typography>
                  <CopyButton text={secret} label="Copy secret" />
                </Box>
              </Alert>
            )}
            {(webhook.hmacRequired || secret) && <CodeBlock code={curl.hmac} maxHeight={320} />}
          </Stack>
        )}

        {tab === 3 && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              When a Measurement ID and API secret are set for this website, every lead is sent to GA4 as a <code>generate_lead</code> event
              (linked to the visitor through the GA client id). This checklist is just a guide — ticks are not saved.
            </Typography>
            <Alert severity={settings.ga4MeasurementId && settings.ga4ApiSecret ? 'success' : 'info'}>
              {settings.ga4MeasurementId && settings.ga4ApiSecret ?
                `GA4 is set up (${settings.ga4MeasurementId}).` :
                'GA4 is not set up yet for this website — add the Measurement ID and API secret in the website settings (Google Analytics section).'}
            </Alert>
            {GA4_CHECKLIST.map((c) => (
              <Box key={c.id}>
                <FormControlLabel
                  control={<Checkbox checked={!!ga[c.id] || (c.id === 'mid' && !!settings.ga4MeasurementId) || (c.id === 'secret' && !!settings.ga4ApiSecret)}
                    onChange={(e) => setGa({ ...ga, [c.id]: e.target.checked })} />}
                  label={<b>{c.label}</b>}
                />
                <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }}>{c.help}</Typography>
              </Box>
            ))}
          </Stack>
        )}

        {tab === 4 && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Sends a sample lead (Jane Sample) through this webhook and its flow, exactly like a real website post. Emails, sheets and
              other steps really run — the lead is marked as a test.
            </Typography>
            <Box>
              <Button variant="contained" startIcon={<PlayArrow />} onClick={runTest} disabled={busy === 'test'}>
                {busy === 'test' ? 'Sending test…' : 'Send a test lead'}
              </Button>
            </Box>
            {test && (
              <Alert severity={test.ok === false ? 'error' : 'success'}>
                {test.ok === false ? 'The test failed.' : 'Test lead received.'}
                {testSubmissionId && <> <RouterLink to={`/wh/submissions/${testSubmissionId}`}>Open its timeline</RouterLink> to see every step.</>}
                <Box component="pre" sx={{ m: 0, mt: 1, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(test, null, 2)}</Box>
              </Alert>
            )}
          </Stack>
        )}

        {tab === 5 && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Paste this into an AI assistant (for example ChatGPT or Claude) together with your form's HTML or a description of your
              site builder. It explains the address, the field names, the spam trap and the tracking fields.
            </Typography>
            <CodeBlock code={aiPrompt(opts)} copyLabel="Copy prompt" maxHeight={420} wrap />
          </Stack>
        )}
      </Box>
    </Paper>
  );
};

export default SetupPacket;
