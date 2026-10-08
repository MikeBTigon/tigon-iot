// Track 1 (speed to lead) — one row of the Today list with its one-tap actions (Call, Text, Claim, Done, Skip).
import React, { useState } from 'react';
import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { Check, PanTool, Phone, Sms, SkipNext } from '@mui/icons-material';
import { useMp } from '../../MpDataContext';
import { contactUrl, isManager, markContacted, openContact, shortDateTime } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { sendText } from '../salesData';
import { claimLead, setTaskStatus, type TodayRow } from './speedData';
import { needsClaim } from './speedUtil';
import SpeedChip from './SpeedChip';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const TodayRowItem: React.FC<{
  row: TodayRow; now: number; marks: number[]; onOpenLead: (id: string) => void; compact?: boolean;
}> = ({ row, now, marks, onOpenLead, compact }) => {
  const { profile } = useMp();
  const [busy, setBusy] = useState(false);
  const me = profile?.uid || '';
  const lead = row.lead;
  const canEditLead = !!lead && (lead.ownerUid === me || isManager(profile));
  const claimable = !!lead && lead.ownerUid === me && needsClaim(lead);
  const task = row.task;
  const canEditTask = !!task && (task.ownerUid === me || isManager(profile));

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) notify(ok, 'success');
    } catch (e) {
      notify(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const call = () => run(async () => {
    await openContact(contactUrl('call', { phone: row.phone }, ''));
    if (lead && canEditLead) await markContacted(lead);
  });

  const text = () => {
    if (task?.suggestedText && row.phone) {
      if (!window.confirm(`Send this text to ${row.phone}?\n\n${task.suggestedText}`)) return;
      run(async () => {
        await sendText({ to: row.phone, body: task.suggestedText || '', createdBy: me, leadId: task.leadId || lead?.id, storeId: lead?.locationId });
        if (canEditTask) await setTaskStatus(task, 'done');
      }, 'Text on its way');
      return;
    }
    if (lead) onOpenLead(lead.id);
  };

  const due = row.section === 'followup' || row.section === 'tasks' ? row.at : 0;
  const overdue = due > 0 && due < now;

  return (
    <Paper variant="outlined" sx={{ p: compact ? 1 : 1.25, borderLeft: 4, borderLeftColor: claimable ? 'warning.main' : overdue ? 'error.main' : 'divider' }}>
      <Box
        onClick={lead ? () => onOpenLead(lead.id) : undefined}
        sx={{ cursor: lead ? 'pointer' : 'default', display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }} noWrap>{row.title}</Typography>
          {row.detail && <Typography variant="body2" color="text.secondary" noWrap>{row.detail}</Typography>}
          {!compact && task?.suggestedText && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.25 }}>"{task.suggestedText}"</Typography>
          )}
        </Box>
        {row.section === 'new' && lead && <SpeedChip lead={lead} now={now} marks={marks} showAnswered={false} />}
        {due > 0 && (
          <Chip size="small" color={overdue ? 'error' : 'warning'} variant={overdue ? 'filled' : 'outlined'}
            label={overdue ? `Overdue · ${shortDateTime(due)}` : `Due ${new Date(due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} />
        )}
        {row.section === 'quotes' && <Chip size="small" color="info" label={`Opened ${shortDateTime(row.at)}`} />}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
        {claimable && (
          <Button size="small" variant="contained" color="warning" startIcon={<PanTool />} disabled={busy}
            onClick={() => run(() => claimLead(lead), 'Claimed — it\'s yours')}>Claim</Button>
        )}
        {row.phone && <Button size="small" variant="outlined" startIcon={<Phone />} disabled={busy} onClick={call}>Call</Button>}
        {(task?.suggestedText ? !!row.phone : !!lead) && (
          <Button size="small" variant="outlined" startIcon={<Sms />} disabled={busy} onClick={text}>Text</Button>
        )}
        {task && canEditTask && (
          <>
            <Button size="small" color="success" startIcon={<Check />} disabled={busy}
              onClick={() => run(() => setTaskStatus(task, 'done'), 'Done')}>Done</Button>
            <Button size="small" color="inherit" startIcon={<SkipNext />} disabled={busy}
              onClick={() => run(() => setTaskStatus(task, 'skipped'))}>Skip</Button>
          </>
        )}
      </Box>
    </Paper>
  );
};
