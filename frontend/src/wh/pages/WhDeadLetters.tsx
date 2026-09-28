import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { limit, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography,
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

const MAX = 500;
/** Error text with ids/numbers blanked so similar failures group together. */
const errorGroup = (e?: string) => (e || 'Unknown error').replace(/\b[0-9a-f]{8,}\b/gi, '…').replace(/\d+/g, '#').slice(0, 120);

/** Steps that failed for good: grouped by step and error, with replay. */
const WhDeadLetters: React.FC = () => {
  const { profile } = useMp();
  const { rows, error } = useWhCollection<WhStepRun>(WH.stepRuns, [where('status', '==', 'dead'), limit(MAX)]);
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
      title="Dead letters"
      subtitle="Steps that still failed after every retry (1 min, 5 min, 30 min, 2 h, 12 h)"
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
      {rows === undefined ? <CircularProgress aria-label="Loading" /> : !rows.length ? (
        <Alert severity="success">Nothing here — every step eventually succeeded.</Alert>
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
                      <TableCell align="right">Attempts</TableCell><TableCell>Gave up</TableCell><TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {g.runs.map((r) => (
                      <TableRow key={r.id} hover selected={selected.has(r.id)}>
                        <TableCell padding="checkbox"><Checkbox checked={selected.has(r.id)} onChange={() => toggle([r.id], !selected.has(r.id))} inputProps={{ 'aria-label': 'Select' }} /></TableCell>
                        <TableCell><RouterLink to={`/wh/submissions/${r.submissionId}`}>Open timeline</RouterLink></TableCell>
                        <TableCell>{domainName.get(r.domainId) || '—'} · {hookName.get(r.webhookId) || '—'}</TableCell>
                        <TableCell>{r.flowKind === 'master' ? 'Master flow' : 'Webhook flow'}</TableCell>
                        <TableCell align="right">{r.attempts}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(r.finishedAt || r.startedAt)}</TableCell>
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
