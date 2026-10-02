import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { limit, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Paper, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { Replay } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import { errText, useDomains, useWebhooks } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { callWh, fmtTime, useWhCollection } from '../data';
import { WH } from '../types';
import type { WhStepRun } from '../types';
import { STEP_META } from '../steps';
import StatusChip from '../components/StatusChip';

const MAX = 2000;
/** Error text with ids/numbers blanked so similar failures group together. */
const errorGroup = (e?: string) => (e || 'Unknown error').replace(/\b[0-9a-f]{8,}\b/gi, '…').replace(/\d+/g, '#').slice(0, 120);

type View = 'failed' | 'retrying';

/**
 * Failed steps: steps that failed for good ('dead' = out of retries, 'failed' = stopped the lead) and steps
 * waiting for their next retry — grouped by step and error, with replay.
 */
const WhDeadLetters: React.FC = () => {
  const { profile } = useMp();
  const [params] = useSearchParams();
  const [view, setView] = useState<View>('failed');
  const [from, setFrom] = useState(params.get('from') || '');
  const domainOnly = params.get('domain') || '';
  const { rows: all, error } = useWhCollection<WhStepRun>(WH.stepRuns, [where('status', 'in', ['dead', 'failed', 'retrying']), limit(MAX)]);
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : 0;
  const inRange = (r: WhStepRun) => (r.finishedAt || r.startedAt || 0) >= fromMs && (!domainOnly || r.domainId === domainOnly);
  const failedCount = (all || []).filter((r) => r.status !== 'retrying' && inRange(r)).length;
  const retryCount = (all || []).filter((r) => r.status === 'retrying' && inRange(r)).length;
  const rows = useMemo(
    () => all?.filter((r) => (view === 'retrying' ? r.status === 'retrying' : r.status !== 'retrying') && inRange(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inRange depends on fromMs/domainOnly
    [all, view, fromMs, domainOnly],
  );
  const { rows: domains } = useDomains();
  const { rows: hooks } = useWebhooks();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const domainName = useMemo(() => new Map((domains || []).map((d) => [d.id, d.name])), [domains]);
  const hookName = useMemo(() => new Map((hooks || []).map((w) => [w.id, w.formName])), [hooks]);

  const groups = useMemo(() => {
    const sorted = (rows || []).slice().sort((a, b) => (b.finishedAt || b.startedAt || 0) - (a.finishedAt || a.startedAt || 0));
    const m = new Map<string, { key: string; stepType: WhStepRun['stepType']; error: string; runs: WhStepRun[] }>();
    for (const r of sorted) {
      const key = `${r.stepType}|${errorGroup(r.error)}`;
      const g = m.get(key) || { key, stepType: r.stepType, error: r.error || 'Unknown error', runs: [] };
      g.runs.push(r);
      m.set(key, g);
    }
    return Array.from(m.values()).sort((a, b) => b.runs.length - a.runs.length);
  }, [rows]);

  const toggle = (ids: string[], on: boolean) => {
    const s = new Set(selected);
    ids.forEach((id) => (on ? s.add(id) : s.delete(id)));
    setSelected(s);
  };

  const replay = async (runs: WhStepRun[]) => {
    const submissionIds = Array.from(new Set(runs.map((r) => r.submissionId)));
    if (!submissionIds.length) return;
    setBusy(true);
    setMsg(null);
    try {
      await callWh('whReplay', { submissionIds, mode: 'failed' });
      await writeAudit(profile, 'wh_replay_dead', `${submissionIds.length} lead(s)`, submissionIds.slice(0, 50).join(','));
      setMsg({ ok: true, text: `Replaying the failed steps of ${submissionIds.length} lead(s). Rows disappear from this list as they succeed.` });
      toggle(runs.map((r) => r.id), false);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const selRuns = (rows || []).filter((r) => selected.has(r.id));

  return (
    <WhShell
      title="Failed steps"
      subtitle="Steps that failed — ran out of retries (1 min, 5 min, 30 min, 2 h, 12 h), stopped the lead, or are waiting to retry"
      actions={(
        <>
          <Button component={RouterLink} to="/wh/submissions">All submissions</Button>
          <Button variant="contained" startIcon={<Replay />} disabled={!selRuns.length || busy} onClick={() => replay(selRuns)}>
            Replay selected{selRuns.length ? ` (${selRuns.length})` : ''}
          </Button>
        </>
      )}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Tabs value={view} onChange={(_e, v: View) => { setView(v); setSelected(new Set()); }}>
          <Tab value="failed" label={`Failed for good (${failedCount})`} />
          <Tab value="retrying" label={`Waiting to retry (${retryCount})`} />
        </Tabs>
        <TextField size="small" type="date" label="Since" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {from && <Button size="small" onClick={() => setFrom('')}>All dates</Button>}
        {domainOnly && <Chip label={`One website: ${domainName.get(domainOnly) || domainOnly}`} />}
      </Box>
      {rows === undefined ? <CircularProgress aria-label="Loading" /> : !rows.length ? (
        <Alert severity="success">
          {view === 'retrying' ? 'No steps are waiting to retry.' : 'No failed steps — every step succeeded or is still retrying.'}
        </Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Fix the cause first (e.g. the email password, sheet sharing or the DMS address in Settings), then replay.
            Only the failed steps run again — steps that worked are not repeated.
            {rows.length >= MAX ? ` Showing the first ${MAX}.` : ''}
          </Typography>
          {groups.map((g) => {
            const ids = g.runs.map((r) => r.id);
            const all = ids.every((id) => selected.has(id));
            const some = !all && ids.some((id) => selected.has(id));
            return (
              <Paper key={g.key} sx={{ mb: 2, overflowX: 'auto' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider' }}>
                  <Checkbox checked={all} indeterminate={some} onChange={() => toggle(ids, !all)} inputProps={{ 'aria-label': 'Select group' }} />
                  <Box sx={{ color: 'primary.main', display: 'flex' }}>{STEP_META[g.stepType]?.icon}</Box>
                  <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                    <Typography sx={{ fontWeight: 700 }}>{STEP_META[g.stepType]?.label || g.stepType} · {g.runs.length} lead(s)</Typography>
                    <Typography variant="body2" color="error" sx={{ wordBreak: 'break-word' }}>{g.error}</Typography>
                  </Box>
                  <Button size="small" variant="outlined" startIcon={<Replay />} disabled={busy} onClick={() => replay(g.runs)}>Replay all {g.runs.length}</Button>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Lead</TableCell><TableCell>Website · form</TableCell><TableCell>Flow</TableCell>
                      <TableCell>Status</TableCell><TableCell align="right">Attempts</TableCell>
                      <TableCell>{view === 'retrying' ? 'Next try' : 'When'}</TableCell><TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {g.runs.map((r) => (
                      <TableRow key={r.id} hover selected={selected.has(r.id)}>
                        <TableCell padding="checkbox"><Checkbox checked={selected.has(r.id)} onChange={() => toggle([r.id], !selected.has(r.id))} inputProps={{ 'aria-label': 'Select' }} /></TableCell>
                        <TableCell><RouterLink to={`/wh/submissions/${r.submissionId}`}>Open timeline</RouterLink></TableCell>
                        <TableCell>{domainName.get(r.domainId) || '—'} · {hookName.get(r.webhookId) || '—'}</TableCell>
                        <TableCell>{r.flowKind === 'master' ? 'Master flow' : 'Webhook flow'}</TableCell>
                        <TableCell><StatusChip status={r.status} /></TableCell>
                        <TableCell align="right">{r.attempts}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(view === 'retrying' ? r.nextAttemptAt : r.finishedAt || r.startedAt)}</TableCell>
                        <TableCell><Button size="small" startIcon={<Replay />} disabled={busy} onClick={() => replay([r])}>Replay</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            );
          })}
        </>
      )}
    </WhShell>
  );
};

export default WhDeadLetters;
