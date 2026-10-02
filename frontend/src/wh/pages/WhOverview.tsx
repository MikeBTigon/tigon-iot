import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { limit, orderBy, where } from 'firebase/firestore';
import {
  Alert, Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Typography,
} from '@mui/material';
import { Add, DeleteSweep, PlayCircleOutline } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import { useMp } from '../../mp/MpDataContext';
import { useWhCollection } from '../data';
import { WH } from '../types';
import type { WhStepRun, WhSubmission } from '../types';
import { lastDayKeys, topEntries } from '../stats';
import { FAILED_STEP_STATUSES, keyToDate, summarizeSubs } from '../submissionData';
import { FAILED_STEPS_PATH } from '../submissionViews';
import { ensureWhDefaults } from '../bootstrap';
import { DAY_MS, errText, useDomains, useGlobal, useMasterFlow, useNow, useWebhooks } from '../components/Wh1Hooks';
import { DayBars, Kpi, Panel, RangeChips, TopList } from '../components/Wh1Ui';
import TriageList from '../components/TriageList';
import { deleteTriage, useSystemTriage } from '../triage';
import type { TriageItem } from '../triage';


/** Webhook Flows dashboard: leads, spam, failures, top websites/forms/sources and what needs attention. */
const WhOverview: React.FC = () => {
  const { profile } = useMp();
  const isAdmin = profile?.role === 'admin';
  const now = useNow();
  const [days, setDays] = useState(7);
  const [domainFilter, setDomainFilter] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMsg, setSetupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const global = useGlobal();
  const master = useMasterFlow(global);
  const { rows: domains } = useDomains();
  const { rows: webhooks } = useWebhooks();
  // Counted from the submissions themselves, so the numbers match the lists the boxes open (and deleted leads drop out).
  const since = now - (days + 1) * DAY_MS;
  const { rows: subs, error: statsError } = useWhCollection<WhSubmission>(
    WH.submissions, [where('receivedAt', '>=', since), orderBy('receivedAt', 'desc'), limit(10000)], [since],
  );
  const { rows: failedRuns } = useWhCollection<WhStepRun>(WH.stepRuns, [where('status', 'in', FAILED_STEP_STATUSES), limit(5000)]);
  const dead = useMemo(() => failedRuns?.filter((r) => r.status === 'dead'), [failedRuns]);

  const domainName = useMemo(() => new Map((domains || []).map((d) => [d.id, d.name || d.url])), [domains]);
  const hookById = useMemo(() => new Map((webhooks || []).map((w) => [w.id, w])), [webhooks]);

  const keys = useMemo(() => lastDayKeys(days, now), [days, now]);
  const summary = useMemo(() => {
    const ids = domainFilter ? new Set((webhooks || []).filter((w) => w.domainId === domainFilter).map((w) => w.id)) : undefined;
    return summarizeSubs(subs, failedRuns, keys, domainFilter || undefined, ids);
  }, [subs, failedRuns, keys, domainFilter, webhooks]);
  // Each box opens the matching list for the same days (and website).
  const listLink = (path: string) => {
    const p = new URLSearchParams(`from=${keyToDate(keys[0])}&to=${keyToDate(keys[keys.length - 1])}${domainFilter ? `&domain=${domainFilter}` : ''}`);
    return `${path}?${p.toString()}`;
  };

  const setupMissing = global === null || (global !== undefined && (!global.masterFlowId || !global.defaultFlowId)) || (!!global?.masterFlowId && master === null);

  const finishSetup = async () => {
    if (!profile) return;
    setSetupBusy(true);
    setSetupMsg(null);
    try {
      await ensureWhDefaults(profile);
      setSetupMsg({ ok: true, text: 'Webhook Flows is set up: global settings, the Master Flow, a standard lead flow and email templates were created.' });
    } catch (e) {
      setSetupMsg({ ok: false, text: errText(e) });
    } finally {
      setSetupBusy(false);
    }
  };

  const loading = domains === undefined || webhooks === undefined || global === undefined;

  // ---- Needs attention (same list as System Triage, websites/Sheets/flows only) ----
  const triage = useSystemTriage(now);
  const attention = triage.items.filter((i) => i.source === 'check' && !i.deleted);
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageErr, setTriageErr] = useState('');
  const removeAttention = async (list: TriageItem[]) => {
    setTriageBusy(true);
    setTriageErr('');
    try {
      await deleteTriage(list, profile?.uid || '');
    } catch (e) {
      setTriageErr(errText(e));
    } finally {
      setTriageBusy(false);
    }
  };

  const setupBox = setupMissing && (
    <Alert
      severity={isAdmin ? 'warning' : 'info'}
      sx={{ mb: 2 }}
      action={isAdmin ? <Button color="inherit" variant="outlined" size="small" onClick={finishSetup} disabled={setupBusy}>{setupBusy ? 'Setting up…' : 'Finish setup'}</Button> : undefined}
    >
      {isAdmin ?
        'Webhook Flows is not fully set up yet (global settings, Master Flow or the default lead flow is missing). "Finish setup" creates sensible defaults — nothing existing is changed.' :
        'Webhook Flows is not fully set up yet. Ask an admin to open Webhook Flows and click "Finish setup".'}
    </Alert>
  );

  const actions = <Button variant="contained" startIcon={<Add />} component={RouterLink} to="/wh/new">Add website</Button>;

  let body: React.ReactNode;
  if (loading) {
    body = <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>;
  } else if (!(domains || []).length) {
    body = (
      <>
        {setupBox}
        {setupMsg && <Alert severity={setupMsg.ok ? 'success' : 'error'} sx={{ mb: 2 }}>{setupMsg.text}</Alert>}
        <Paper sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <PlayCircleOutline sx={{ fontSize: 56, color: 'primary.main' }} />
          <Typography variant="h5" sx={{ mt: 1, mb: 2, fontWeight: 600 }}>Get every website lead in one place</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 640, mx: 'auto', mb: 3 }}>
            Webhook Flows gives each of your websites' contact forms its own private address to send leads to.
            Every lead is saved here, checked for spam and duplicates, and then handled automatically — emailed to your team,
            added to Google Sheets, sent to the DMS and Google Analytics. You can see exactly what happened to each lead and re-send anything that failed.
          </Typography>
          <Button size="large" variant="contained" startIcon={<Add />} component={RouterLink} to="/wh/new">Add your first website</Button>
        </Paper>
      </>
    );
  } else {
    const topSites = topEntries(summary.byDomain).map(([id, count]) => ({ key: id, label: domainName.get(id) || id, count, to: `/wh/websites/${id}` }));
    const topHooks = topEntries(summary.byWebhook).map(([id, count]) => {
      const w = hookById.get(id);
      return { key: id, label: w ? `${w.formName} · ${domainName.get(w.domainId) || ''}` : id, count, to: `/wh/webhooks/${id}` };
    });
    const topSources = topEntries(summary.bySource).map(([src, count]) => ({ key: src, label: src || '(direct)', count }));
    const activeSites = (domains || []).filter((d) => d.status === 'active').length;
    body = (
      <>
        {setupBox}
        {setupMsg && <Alert severity={setupMsg.ok ? 'success' : 'error'} sx={{ mb: 2 }}>{setupMsg.text}</Alert>}
        {statsError && <Alert severity="warning" sx={{ mb: 2 }}>Could not load the leads: {statsError}</Alert>}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
          <RangeChips value={days} onChange={setDays} />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="wh-ov-domain">Website</InputLabel>
            <Select labelId="wh-ov-domain" label="Website" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
              <MenuItem value="">All websites</MenuItem>
              {(domains || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 2 }}>
          <Kpi label="Leads" value={summary.total - summary.spam} hint={`${domainFilter ? 'this website' : 'all websites'}, spam left out — open`} to={listLink('/wh/submissions/leads')} />
          <Kpi label="Spam blocked" value={summary.spam} hint="open the blocked leads" to={listLink('/wh/submissions/spam-blocked')} />
          <Kpi label="Duplicates" value={summary.duplicate} hint="open the duplicates" to={listLink('/wh/submissions/duplicates')} />
          <Kpi
            label="Failed steps"
            value={summary.failedSteps}
            hint={`${dead ? (dead.length >= 5000 ? '5000+' : dead.length) : 0} out of retries — open`}
            to={listLink(FAILED_STEPS_PATH)}
            tone={summary.failedSteps ? 'error' : undefined}
          />
          <Kpi label="Active websites" value={activeSites} hint={`${(webhooks || []).length} webhook(s) — open`} to="/wh/websites" />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 2, mb: 2 }}>
          <Panel title="Leads per day">
            {subs === undefined ? <CircularProgress size={24} /> : <DayBars data={summary.series} />}
          </Panel>
          <Panel
            title="Needs attention"
            action={<Button size="small" component={RouterLink} to="/wh/triage">System Triage</Button>}
          >
            {triageErr && <Alert severity="error" sx={{ mb: 1 }}>{triageErr}</Alert>}
            {!attention.length ? (
              <Typography variant="body2" color="text.secondary">All good — nothing needs attention.</Typography>
            ) : (
              <>
                <TriageList items={attention.slice(0, 12)} now={now} busy={triageBusy} onDelete={removeAttention} />
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                  {attention.length > 12 && <Typography variant="caption">…and {attention.length - 12} more</Typography>}
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" color="error" startIcon={<DeleteSweep />} disabled={triageBusy} onClick={() => removeAttention(attention)}>
                    Delete all
                  </Button>
                </Box>
              </>
            )}
          </Panel>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <Panel title="Top websites"><TopList rows={topSites} empty="No leads in this period." /></Panel>
          <Panel title="Top forms (webhooks)"><TopList rows={topHooks} empty="No leads in this period." /></Panel>
          <Panel title="Top sources"><TopList rows={topSources} empty="No leads in this period." /></Panel>
        </Box>
      </>
    );
  }

  return (
    <WhShell title="Webhook Flows" subtitle="Leads from all your website forms" actions={actions}>
      {body}
    </WhShell>
  );
};

export default WhOverview;
