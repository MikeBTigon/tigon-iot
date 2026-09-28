import React, { useState } from 'react';
import { where } from 'firebase/firestore';
import {
  Alert, Box, Button, CircularProgress, Collapse, Paper, Stack, Typography,
} from '@mui/material';
import { ExpandLess, ExpandMore, Replay } from '@mui/icons-material';
import { fmtTime, useWhCollection } from '../data';
import { WH } from '../types';
import type { WhFlow, WhStepRun } from '../types';
import { STEP_META } from '../steps';
import StatusChip from './StatusChip';

const FLOW_TITLE: Record<WhStepRun['flowKind'], string> = { webhook: 'Webhook flow', master: 'Master flow' };

const duration = (r: WhStepRun) => {
  if (!r.finishedAt || !r.startedAt) return '';
  const ms = r.finishedAt - r.startedAt;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
};

const StepCard: React.FC<{ run: WhStepRun; name: string; onRerun?: (r: WhStepRun) => void; busy?: boolean }> = ({ run, name, onRerun, busy }) => {
  const [open, setOpen] = useState(false);
  const meta = STEP_META[run.stepType];
  const hasResponse = run.response && Object.keys(run.response).length > 0;
  return (
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'action.selected', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main', flexShrink: 0 }}>
          {meta?.icon}
        </Box>
        <Box sx={{ flexGrow: 1, width: 2, bgcolor: 'divider', my: 0.5 }} />
      </Box>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>{name}</Typography>
          <StatusChip status={run.status} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {meta?.label || run.stepType} · attempt{run.attempts === 1 ? '' : 's'}: {run.attempts || 0} · started {fmtTime(run.startedAt)}
          {run.finishedAt ? ` · finished ${fmtTime(run.finishedAt)}` : ''}{duration(run) ? ` (${duration(run)})` : ''}
        </Typography>
        {run.status === 'retrying' && run.nextAttemptAt && (
          <Typography variant="body2" color="warning.main">Next retry: {fmtTime(run.nextAttemptAt)}</Typography>
        )}
        {run.status === 'dead' && (
          <Typography variant="body2" color="error">Gave up after {run.attempts} attempts — it is on the dead letters list.</Typography>
        )}
        {run.error && <Typography variant="body2" color="error" sx={{ wordBreak: 'break-word', mt: 0.5 }}>{run.error}</Typography>}
        <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          {hasResponse && (
            <Button size="small" onClick={() => setOpen(!open)} endIcon={open ? <ExpandLess /> : <ExpandMore />}>Details</Button>
          )}
          {onRerun && (
            <Button size="small" startIcon={<Replay />} onClick={() => onRerun(run)} disabled={busy}>Re-run this step</Button>
          )}
        </Box>
        {hasResponse && (
          <Collapse in={open}>
            <Box component="pre" sx={{ m: 0, mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, overflow: 'auto', maxHeight: 300 }}>
              {JSON.stringify(run.response, null, 2)}
            </Box>
          </Collapse>
        )}
      </Paper>
    </Box>
  );
};

/** Per-lead audit log: every step run, grouped by flow (webhook flow → master flow), in run order. */
const LeadTimeline: React.FC<{
  submissionId: string;
  webhookFlow?: WhFlow | null;
  masterFlow?: WhFlow | null;
  onRerunStep?: (run: WhStepRun) => void;
  busy?: boolean;
}> = ({ submissionId, webhookFlow, masterFlow, onRerunStep, busy }) => {
  const { rows, error } = useWhCollection<WhStepRun>(WH.stepRuns, [where('submissionId', '==', submissionId)], [submissionId]);
  if (error) return <Alert severity="error">Could not load the steps: {error}</Alert>;
  if (!rows) return <CircularProgress aria-label="Loading steps" />;
  if (!rows.length) {
    return <Alert severity="info">No steps have run yet. New leads are usually processed within a minute.</Alert>;
  }
  const flowOf = (k: WhStepRun['flowKind']) => (k === 'master' ? masterFlow : webhookFlow);
  const order = (r: WhStepRun) => {
    const idx = flowOf(r.flowKind)?.steps?.findIndex((s) => s.id === r.stepId) ?? -1;
    return idx < 0 ? 999 : idx;
  };
  const stepName = (r: WhStepRun) => flowOf(r.flowKind)?.steps?.find((s) => s.id === r.stepId)?.name || STEP_META[r.stepType]?.label || r.stepType;
  const groups = (['webhook', 'master'] as const).map((k) => ({
    kind: k,
    runs: rows.filter((r) => r.flowKind === k).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0) || order(a) - order(b)),
  })).filter((g) => g.runs.length);
  return (
    <Stack spacing={2}>
      {groups.map((g) => (
        <Box key={g.kind}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            {FLOW_TITLE[g.kind]}{flowOf(g.kind)?.name ? ` — ${flowOf(g.kind)?.name}` : ''}
          </Typography>
          {g.runs.map((r) => <StepCard key={r.id} run={r} name={stepName(r)} onRerun={onRerunStep} busy={busy} />)}
        </Box>
      ))}
    </Stack>
  );
};

export default LeadTimeline;
