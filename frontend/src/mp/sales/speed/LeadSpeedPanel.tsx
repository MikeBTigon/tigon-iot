// Track 1 (speed to lead) — inside the lead dialog: response timer, who it was handed to, Claim button.
import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { PanTool } from '@mui/icons-material';
import type { Lead } from '../../growthTypes';
import type { LeadSalesFields } from '../salesTypes';
import { useMp } from '../../MpDataContext';
import { useNow } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { useSalesSettings } from '../salesData';
import { claimLead } from './speedData';
import { minutesLabel, needsClaim, speedState } from './speedUtil';
import SpeedChip from './SpeedChip';

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const LeadSpeedPanel: React.FC<{ lead: Lead & LeadSalesFields }> = ({ lead }) => {
  const { profile, userName } = useMp();
  const { settings } = useSalesSettings();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const mine = !!profile && lead.ownerUid === profile.uid;
  const claimable = mine && needsClaim(lead);
  const passes = (lead.assignHistory || []).filter((h) => h.reason === 'not_claimed').length;

  const claim = async () => {
    setBusy(true);
    try {
      await claimLead(lead);
      notify('Claimed — it\'s yours. Reach out now!', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const lines: string[] = [];
  if (lead.assignedAt) {
    lines.push(`Handed to ${mine ? 'you' : userName(lead.ownerUid)} at ${time(lead.assignedAt)}${passes ? ` (passed on ${passes} time${passes > 1 ? 's' : ''})` : ''}.`);
  }
  if (lead.claimedAt) lines.push(`Claimed at ${time(lead.claimedAt)}.`);
  else if (claimable && lead.claimDeadline) {
    const left = (lead.claimDeadline - now) / 60_000;
    lines.push(left > 0 ? `Claim it in the next ${minutesLabel(Math.ceil(left))} or it goes to the next person.` : 'Claim it now — it\'s about to go to the next person.');
  }
  if (lead.source === 'facebook_message') {
    lines.push(`Came in as a Facebook message${lead.fbMessages && lead.fbMessages > 1 ? ` (${lead.fbMessages} messages)` : ''} — reply in Messenger on the phone that got it.`);
  }

  if (!lines.length && !claimable && !speedState(lead, now, settings.speed.alertMinutes)) return null;
  return (
    <Box sx={{ border: 1, borderColor: claimable ? 'warning.main' : 'divider', borderRadius: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Response time</Typography>
        <SpeedChip lead={lead} now={now} marks={settings.speed.alertMinutes} />
      </Box>
      {lines.map((l) => <Typography key={l} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{l}</Typography>)}
      {claimable && (
        <Button variant="contained" color="warning" startIcon={<PanTool />} disabled={busy} onClick={claim} sx={{ mt: 1 }}>
          Claim this lead
        </Button>
      )}
    </Box>
  );
};

export default LeadSpeedPanel;
