import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { limit, where } from 'firebase/firestore';
import {
  Alert, Box, Button, CircularProgress, FormControl, InputLabel, List, ListItem, ListItemIcon, ListItemText, MenuItem,
  Paper, Select, Stack, Typography,
} from '@mui/material';
import { Add, ErrorOutline, PlayCircleOutline, ReportProblem, TableChart, WarningAmber } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import { useMp } from '../../mp/MpDataContext';
import { useWhCollection, useWhDoc } from '../data';
import { resolveSettings } from '../shared';
import { WH } from '../types';
import type { WhStepRun } from '../types';
import { lastDayKeys, summarize, topEntries, useWhStats } from '../stats';
import { ensureWhDefaults } from '../bootstrap';
import { DAY_MS, ago, errText, useDomains, useGlobal, useMasterFlow, useNow, useWebhooks } from '../components/Wh1Hooks';
import { DayBars, Kpi, Panel, RangeChips, TopList } from '../components/Wh1Ui';

interface SheetsStatus { id: string; lastError?: string; lastErrorAt?: number; pendingRows?: number; deadRows?: number }

interface Attention { key: string; icon: React.ReactNode; text: React.ReactNode; to?: string }

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
  const { rows: stats, error: statsError } = useWhStats(days);
  const sheets = useWhDoc<SheetsStatus>(WH.settings, 'sheets_status');
  const { rows: dead } = useWhCollection<WhStepRun>(WH.stepRuns, [where('status', '==', 'dead'), limit(500)]);

  const domainName = useMemo(() => new Map((domains || []).map((d) => [d.id, d.name || d.url])), [domains]);
  const hookById = useMemo(() => new Map((webhooks || []).map((w) => [w.id, w])), [webhooks]);

  const keys = useMemo(() => lastDayKeys(days, now), [days, now]);
  const summary = useMemo(() => {
    const ids = domainFilter ? new Set((webhooks || []).filter((w) => w.domainId === domainFilter).map((w) => w.id)) : undefined;
    return summarize(stats, keys, domainFilter || undefined, ids);
  }, [stats, keys, domainFilter, webhooks]);

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

  // ---- Needs attention ----
  const attention: Attention[] = [];
  if (!loading) {
    for (const d of domains || []) {
      if (d.status !== 'active') continue;
      const s = resolveSettings(global || undefined, master?.settings, d.settings);
      const limitDays = s.alertNoLeadsDays ?? 3;
      if (!limitDays) continue;
      const hooks = (webhooks || []).filter((w) => w.domainId === d.id && w.status === 'active');
      if (!hooks.length) continue;
      const last = Math.max(0, ...hooks.map((w) => w.lastReceivedAt || 0));
      const since = last || d.createdAt || 0;
      if (now - since > limitDays * DAY_MS) {
        attention.push({
          key: `nl-${d.id}`,
          icon: <WarningAmber color="warning" />,
          text: <><b>{d.name}</b> — {last ? `no leads since ${ago(last, now)}` : `no leads yet (added ${ago(d.createdAt, now)})`}. Check that the form still works.</>,
          to: `/wh/websites/${d.id}`,
        });
      }
    }
  }
  if (sheets?.lastError) {
    attention.push({
      key: 'sheets',
      icon: <TableChart color="error" />,
      text: <>Google Sheets: {sheets.lastError}{sheets.lastErrorAt ? ` (${ago(sheets.lastErrorAt, now)})` : ''}. Make sure each sheet is shared with the service account (see Settings).</>,
      to: '/wh/settings',
    });
  }
  if (sheets && (sheets.deadRows || 0) > 0) {
    attention.push({ key: 'sheets-dead', icon: <TableChart color="error" />, text: <>{sheets.deadRows} sheet row(s) could not be written after several tries.</> });
  }
  if (sheets && (sheets.pendingRows || 0) > 200) {
    attention.push({ key: 'sheets-pending', icon: <TableChart color="warning" />, text: <>{sheets.pendingRows} rows are waiting to be written to Google Sheets.</> });
  }
  if (dead && dead.length) {
    attention.push({
      key: 'dead',
      icon: <ReportProblem color="error" />,
      text: <>{dead.length >= 500 ? '500+' : dead.length} step(s) failed for good (dead letters). Fix the cause, then replay them.</>,
      to: '/wh/dead',
    });
  }

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
        {statsError && <Alert severity="warning" sx={{ mb: 2 }}>Could not load the daily counters: {statsError}</Alert>}
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
          <Kpi label="Leads" value={summary.total} hint={domainFilter ? 'this website' : 'all websites'} to="/wh/submissions" />
          <Kpi label="Spam blocked" value={domainFilter ? '—' : summary.spam} hint={domainFilter ? 'shown for all websites only' : undefined} />
          <Kpi label="Duplicates" value={domainFilter ? '—' : summary.duplicate} hint={domainFilter ? 'shown for all websites only' : undefined} />
          <Kpi
            label="Failed steps"
            value={domainFilter ? '—' : summary.failedSteps}
            hint={dead ? `${dead.length >= 500 ? '500+' : dead.length} dead letter(s) — open` : undefined}
            to="/wh/dead"
            tone={dead && dead.length ? 'error' : undefined}
          />
          <Kpi label="Active websites" value={activeSites} hint={`${(webhooks || []).length} webhook(s)`} to="/wh/websites" />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 2, mb: 2 }}>
          <Panel title="Leads per day">
            {stats === undefined ? <CircularProgress size={24} /> : <DayBars data={summary.series} />}
          </Panel>
          <Panel title="Needs attention">
            {!attention.length ? (
              <Typography variant="body2" color="text.secondary">All good — nothing needs attention.</Typography>
            ) : (
              <List dense disablePadding>
                {attention.slice(0, 12).map((a) => (
                  <ListItem key={a.key} disableGutters {...(a.to ? { component: RouterLink, to: a.to, sx: { color: 'inherit' } } : {})}>
                    <ListItemIcon sx={{ minWidth: 36 }}>{a.icon}</ListItemIcon>
                    <ListItemText primary={a.text} />
                  </ListItem>
                ))}
                {attention.length > 12 && <Typography variant="caption">…and {attention.length - 12} more</Typography>}
              </List>
            )}
          </Panel>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <Panel title="Top websites"><TopList rows={topSites} empty="No leads in this period." /></Panel>
          <Panel title="Top forms (webhooks)"><TopList rows={topHooks} empty="No leads in this period." /></Panel>
          <Panel title="Top sources">
            {domainFilter ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <ErrorOutline fontSize="small" color="disabled" />
                <Typography variant="body2" color="text.secondary">Sources are counted for all websites together — choose "All websites".</Typography>
              </Stack>
            ) : <TopList rows={topSources} empty="No leads in this period." />}
          </Panel>
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
