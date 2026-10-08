// Track 3 — one appointment line with Showed / No-show / Cancel / Reschedule (Appointments page and the dashboard card).
import React from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useMp } from '../../MpDataContext';
import { updateLead, useNow } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Appointment, AppointmentStatus } from '../salesTypes';
import { APPT_STATUS_COLOR, APPT_STATUS_LABEL, KIND_LABEL, nyClock, storeName } from './closingUtils';

async function setApptStatus(a: Appointment, status: AppointmentStatus) {
  await updateDoc(doc(db, SALES_COLLECTIONS.appointments, a.id), { status, updatedAt: Date.now() });
  if (status === 'showed' && a.kind === 'test_drive' && a.leadId) await updateLead(a.leadId, { testDriveAt: a.startAt }).catch(() => undefined);
}

const ApptRow: React.FC<{ a: Appointment; onReschedule?: () => void; showStore?: boolean }> = ({ a, onReschedule, showStore }) => {
  const { userName } = useMp();
  const now = useNow();
  const mark = (s: AppointmentStatus) => setApptStatus(a, s).then(() => notify(`Marked ${APPT_STATUS_LABEL[s].toLowerCase()}`, 'success'))
    .catch((e) => notify(e instanceof Error ? e.message : String(e), 'error'));
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', alignItems: 'center' }}>
      <Typography sx={{ fontWeight: 800, width: 72, color: 'primary.main' }}>{nyClock(a.startAt)}</Typography>
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Typography sx={{ fontWeight: 700 }}>{a.name} <Typography component="span" variant="body2" color="text.secondary">· {KIND_LABEL[a.kind] || a.kind}</Typography></Typography>
        <Typography variant="body2"><a href={`tel:${a.phone}`}>{a.phone}</a>{a.cartTitle ? ` · ${a.cartTitle}` : ''}</Typography>
        <Typography variant="caption" color="text.secondary">
          {showStore ? `${storeName(a.storeId)} · ` : ''}{a.ownerUid ? userName(a.ownerUid) : 'No owner'}{a.source === 'public' ? ' · booked online' : ''}{a.notes ? ` · "${a.notes}"` : ''}
        </Typography>
      </Box>
      <Chip size="small" color={APPT_STATUS_COLOR[a.status]} label={APPT_STATUS_LABEL[a.status]} />
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {a.status !== 'showed' && <Button size="small" color="success" onClick={() => mark('showed')}>Showed</Button>}
        {a.status !== 'no_show' && a.startAt < now + 3_600_000 && <Button size="small" color="error" onClick={() => mark('no_show')}>No-show</Button>}
        {a.status === 'booked' && <Button size="small" color="inherit" onClick={() => mark('cancelled')}>Cancel</Button>}
        {onReschedule && <Button size="small" onClick={onReschedule}>Reschedule</Button>}
      </Box>
    </Box>
  );
};

export default ApptRow;
