import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, CircularProgress, FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Radio, RadioGroup,
  Select, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import { ArrowBack, ArrowForward, CheckCircle } from '@mui/icons-material';
import { formatUsPhone } from '../phone';
import WhShell from '../components/WhShell';
import LeadChannelSelect, { DEFAULT_LEAD_CHANNEL } from '../components/LeadChannelSelect';
import { CHANNEL_LABEL } from '../../mp/crm/crmData';
import SetupPacket from '../components/SetupPacket';
import { useMp } from '../../mp/MpDataContext';
import { db } from '../../config/firebase';
import { splitList, useWhDoc } from '../data';
import { resolveSettings } from '../shared';
import { WH } from '../types';
import type { WhDomain, WhFlow, WhSettings, WhWebhook } from '../types';
import { ensureWhDefaults, loadGlobal } from '../bootstrap';
import { PLATFORMS, createWebsite, extractSheetId, normalizeSiteUrl } from '../websites';
import type { NewWebsiteResult } from '../websites';
import { errText, useDomains, useFlows, useGlobal, useMasterFlow } from '../components/Wh1Hooks';

const STEPS = ['Website', 'Flow & delivery', 'Create', 'Setup packet'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shows the setup packet of the website that was just created (live docs). */
const Result: React.FC<{ res: NewWebsiteResult }> = ({ res }) => {
  const global = useGlobal();
  const master = useMasterFlow(global);
  const domain = useWhDoc<WhDomain>(WH.domains, res.domainId);
  const webhook = useWhDoc<WhWebhook>(WH.webhooks, res.webhookId);
  const flow = useWhDoc<WhFlow>(WH.flows, res.flowId);
  if (!webhook || !domain) return <CircularProgress aria-label="Loading" />;
  const settings = resolveSettings(global || undefined, master?.settings, domain.settings, flow?.settings, webhook.settings);
  return (
    <Stack spacing={2}>
      <Alert severity="success" icon={<CheckCircle />}>
        <b>{domain.name}</b> is ready. Put the code below on the website (or send the setup packet to your web person), then send a test lead.
      </Alert>
      <SetupPacket webhook={webhook} domain={domain} settings={settings} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" component={RouterLink} to={`/wh/websites/${res.domainId}`}>Website settings</Button>
        <Button variant="outlined" component={RouterLink} to={`/wh/webhooks/${res.webhookId}`}>Webhook details</Button>
        <Button variant="outlined" component={RouterLink} to={`/wh/flows/${res.flowId}`}>Open the flow</Button>
        <Button component={RouterLink} to="/wh">Back to overview</Button>
      </Box>
    </Stack>
  );
};

/** "Add website" generator: site → flow & delivery → create → setup packet. */
const WhAddWebsite: React.FC = () => {
  const { profile } = useMp();
  const isAdmin = profile?.role === 'admin';
  const global = useGlobal();
  const { rows: flows } = useFlows();
  const { rows: domains } = useDomains();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [platform, setPlatform] = useState('wordpress');
  const [leadChannel, setLeadChannel] = useState(DEFAULT_LEAD_CHANNEL);
  const [phoneInput, setPhoneInput] = useState('');
  const phone = formatUsPhone(phoneInput);
  const [formName, setFormName] = useState('Contact form');
  const [flowMode, setFlowMode] = useState<'shared' | 'copy'>('shared');
  const [templateId, setTemplateId] = useState('');
  const [emails, setEmails] = useState('');
  const [sheet, setSheet] = useState('');
  const [gaId, setGaId] = useState('');
  const [gaSecret, setGaSecret] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<NewWebsiteResult | null>(null);

  const url = normalizeSiteUrl(urlInput);
  const templates = useMemo(() => (flows || []).filter((f) => f.type === 'template').sort((a, b) => a.name.localeCompare(b.name)), [flows]);
  const defaultFlow = (flows || []).find((f) => f.id === global?.defaultFlowId);
  const defaultsMissing = global !== undefined && flows !== undefined && !defaultFlow;
  const chosenTemplateId = templateId || defaultFlow?.id || templates[0]?.id || '';
  const existing = url.url ? (domains || []).find((d) => d.url === url.url) : undefined;
  const emailList = splitList(emails);
  const badEmails = emailList.filter((e) => !EMAIL_RE.test(e));
  const badGa = gaId.trim() && !/^G-[A-Z0-9]{4,}$/i.test(gaId.trim());

  const step0Error = !name.trim() ? 'Enter a name for the website.' : url.error || (!formName.trim() ? 'Enter a form name.' : phone.error);
  const step1Error = badEmails.length ? `Not an email address: ${badEmails.join(', ')}` : badGa ? 'The Measurement ID looks like G-XXXXXXXXXX.' :
    flowMode === 'copy' && !chosenTemplateId && !(defaultsMissing && isAdmin) ? 'Choose a flow to copy.' : '';

  const next = () => {
    setTouched(true);
    if (step === 0 && step0Error) return;
    if (step === 1 && step1Error) return;
    setTouched(false);
    setStep(step + 1);
  };

  const create = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      let g = await loadGlobal();
      let defaultFlowId = g?.defaultFlowId;
      let tplFlow = (flows || []).find((f) => f.id === (flowMode === 'copy' ? chosenTemplateId : defaultFlowId));
      if (!g || !defaultFlowId || !tplFlow) {
        if (!isAdmin) throw new Error('Webhook Flows is not set up yet (the default lead flow is missing). Ask an admin to open Webhook Flows → Overview and click "Finish setup".');
        const ids = await ensureWhDefaults(profile);
        g = await loadGlobal();
        defaultFlowId = g?.defaultFlowId || ids.defaultFlowId;
        const wantId = flowMode === 'copy' && templateId ? templateId : defaultFlowId;
        tplFlow = (flows || []).find((f) => f.id === wantId);
        if (!tplFlow) {
          const snap = await getDoc(doc(db, WH.flows, wantId));
          if (!snap.exists()) throw new Error('The default lead flow could not be created.');
          tplFlow = { ...(snap.data() as WhFlow), id: snap.id };
        }
      }
      const settings: WhSettings = {};
      if (emailList.length) settings.emailTo = emailList;
      if (sheet.trim()) settings.sheetId = extractSheetId(sheet);
      if (gaId.trim()) settings.ga4MeasurementId = gaId.trim().toUpperCase();
      if (gaSecret.trim()) settings.ga4ApiSecret = gaSecret.trim();
      const res = await createWebsite({
        name, url: url.url as string, platform, leadChannel, phone: phone.phone, formName, flowMode, templateFlow: tplFlow, settings,
      }, profile);
      setResult(res);
      setStep(3);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const summaryFlow = flowMode === 'shared' ? (defaultFlow?.name || 'Standard lead flow') : `Own copy of "${templates.find((t) => t.id === chosenTemplateId)?.name || 'Standard lead flow'}"`;

  return (
    <WhShell title="Add website" subtitle="Connect a website's lead form in a few minutes">
      <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
        {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
      </Stepper>

      {defaultsMissing && step < 3 && (
        <Alert severity={isAdmin ? 'info' : 'warning'} sx={{ mb: 2 }}>
          {isAdmin ?
            'Webhook Flows has not been set up yet. The default settings, Master Flow and a standard lead flow will be created automatically when you create this website.' :
            'Webhook Flows has not been set up yet (no default lead flow). Ask an admin to open Webhook Flows → Overview and click "Finish setup" before adding a website.'}
        </Alert>
      )}

      {step === 0 && (
        <Paper sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
          <Stack spacing={2}>
            <Typography variant="h6">Which website?</Typography>
            <TextField label="Website name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TIGON Golf Carts Philadelphia"
              helperText="How this website is shown in lists and emails." error={touched && !name.trim()} required />
            <TextField label="Website address" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com"
              onBlur={() => { if (url.url) setUrlInput(url.url); }}
              error={touched && !!url.error} required
              helperText={(touched && url.error) || (url.url ? `Saved as ${url.url}` : 'The home page address. Only the domain is kept.')} />
            {existing && <Alert severity="warning">This website already exists: <RouterLink to={`/wh/websites/${existing.id}`}>{existing.name}</RouterLink>. To add another form to it, open it and click "Add another form".</Alert>}
            <FormControl>
              <InputLabel id="wh-platform">Website builder</InputLabel>
              <Select labelId="wh-platform" label="Website builder" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </Select>
            </FormControl>
            <LeadChannelSelect value={leadChannel} onChange={setLeadChannel} />
            <TextField label="Website phone number" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="215-555-0123"
              type="tel" onBlur={() => { if (phone.phone) setPhoneInput(phone.phone); }} error={!!phoneInput.trim() && !!phone.error}
              helperText={(phoneInput.trim() && phone.error) || (phone.phone ? `Saved as ${phone.phone}` : 'The phone number shown on this website. Type it any way — it is saved as +1-xxx-xxx-xxxx.')} />
            <TextField label="Form name" value={formName} onChange={(e) => setFormName(e.target.value)}
              helperText='Which form on the site this is, e.g. "Contact form", "Trade-in form", "Get a quote".' error={touched && !formName.trim()} />
            {touched && step0Error && <Alert severity="error">{step0Error}</Alert>}
          </Stack>
        </Paper>
      )}

      {step === 1 && (
        <Paper sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
          <Stack spacing={2}>
            <Typography variant="h6">What happens to each lead?</Typography>
            <RadioGroup value={flowMode} onChange={(e) => setFlowMode(e.target.value as 'shared' | 'copy')}>
              <FormControlLabel value="shared" control={<Radio />} label={
                <Box sx={{ py: 0.5 }}>
                  <b>Use the standard lead flow (recommended)</b>
                  <Typography variant="body2" color="text.secondary">
                    Shared by many websites — {defaultFlow ? `"${defaultFlow.name}"` : 'check fields, skip duplicates, email your team, add to Google Sheets'}.
                    Improve it once and every website using it gets the change.
                  </Typography>
                </Box>
              } />
              <FormControlLabel value="copy" control={<Radio />} label={
                <Box sx={{ py: 0.5 }}>
                  <b>Give this website its own flow</b>
                  <Typography variant="body2" color="text.secondary">A private copy of a template you can change without affecting other websites.</Typography>
                </Box>
              } />
            </RadioGroup>
            {flowMode === 'copy' && (
              <FormControl>
                <InputLabel id="wh-tpl">Copy from</InputLabel>
                <Select labelId="wh-tpl" label="Copy from" value={chosenTemplateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}{t.id === global?.defaultFlowId ? ' (standard)' : ''}</MenuItem>)}
                  {!templates.length && <MenuItem value="" disabled>No template flows yet</MenuItem>}
                </Select>
              </FormControl>
            )}
            <Typography variant="h6" sx={{ pt: 1 }}>Delivery</Typography>
            <TextField label="Email leads to" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="sales@example.com, manager@example.com"
              error={!!badEmails.length}
              helperText={badEmails.length ? `Not an email address: ${badEmails.join(', ')}` : 'Who gets an email for each lead from this website. Separate several with commas. Leave empty to use the default recipients.'} />
            <TextField label="Google Sheet (optional)" value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"
              helperText="Paste the sheet's link. Every lead is added as a row. Share the sheet (Editor) with the service account shown in Settings." />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, pt: 1 }}>Google Analytics 4 (optional)</Typography>
            <Typography variant="body2" color="text.secondary">
              Sends a "generate_lead" event to GA4 for each lead, so you can see which ads and pages bring leads.
              Find both values in GA4 → Admin → Data streams → click the website's stream: the <b>Measurement ID</b> is at the top (G-…),
              and under <b>Measurement Protocol API secrets</b> click Create to get an <b>API secret</b>.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Measurement ID" value={gaId} onChange={(e) => setGaId(e.target.value)} placeholder="G-XXXXXXXXXX" error={!!badGa}
                helperText={badGa ? 'Should look like G-XXXXXXXXXX' : ' '} />
              <TextField label="API secret" value={gaSecret} onChange={(e) => setGaSecret(e.target.value)} helperText=" " />
            </Box>
            {touched && step1Error && <Alert severity="error">{step1Error}</Alert>}
          </Stack>
        </Paper>
      )}

      {step === 2 && (
        <Paper sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6">Ready to create</Typography>
            {[
              ['Website', `${name.trim()} — ${url.url}`],
              ['Builder', PLATFORMS.find((p) => p.value === platform)?.label || platform],
              ['Lead channel', CHANNEL_LABEL[leadChannel as keyof typeof CHANNEL_LABEL] || leadChannel],
              ['Phone number', phone.phone || 'none'],
              ['Form', formName.trim()],
              ['Flow', summaryFlow],
              ['Email leads to', emailList.join(', ') || 'default recipients'],
              ['Google Sheet', sheet.trim() ? extractSheetId(sheet) : 'default / none'],
              ['Google Analytics', gaId.trim() ? `${gaId.trim().toUpperCase()}${gaSecret.trim() ? ' (API secret set)' : ' (no API secret yet)'}` : 'not connected'],
            ].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', gap: 2 }}>
                <Typography sx={{ width: 150, flexShrink: 0 }} color="text.secondary">{k}</Typography>
                <Typography sx={{ wordBreak: 'break-word', minWidth: 0 }}>{v}</Typography>
              </Box>
            ))}
            <Typography variant="body2" color="text.secondary">
              This creates the website, {flowMode === 'copy' ? 'its own flow, ' : ''}and a webhook (a private address the form sends leads to).
              You can change everything later.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </Paper>
      )}

      {step === 3 && result && <Result res={result} />}

      {step < 3 && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2, maxWidth: 720 }}>
          <Button startIcon={<ArrowBack />} disabled={step === 0 || busy} onClick={() => { setTouched(false); setStep(step - 1); }}>Back</Button>
          <Box sx={{ flexGrow: 1 }} />
          {step < 2 && <Button variant="contained" endIcon={<ArrowForward />} onClick={next}>Next</Button>}
          {step === 2 && (
            <Button variant="contained" onClick={create} disabled={busy || (defaultsMissing && !isAdmin)}>
              {busy ? 'Creating…' : 'Create website'}
            </Button>
          )}
        </Box>
      )}
    </WhShell>
  );
};

export default WhAddWebsite;
