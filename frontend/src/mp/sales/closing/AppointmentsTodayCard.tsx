// Track 3 — Dashboard → This Device: today's appointments at the signed-in person's store (or their own).
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { Event } from '@mui/icons-material';
import { useMp } from '../../MpDataContext';
import { useNow } from '../../crm/crmData';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Appointment } from '../salesTypes';
import { nyDateKey, storeName, useWhere } from './closingUtils';
import ApptRow from './ApptRow';

const AppointmentsTodayCard: React.FC<object> = () => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const now = useNow();
  const today = nyDateKey(now);
  const { rows } = useWhere<Appointment>(SALES_COLLECTIONS.appointments, 'dateKey', profile ? today : undefined);
  if (!profile) return null;
  const loc = profile.location;
  const mine = rows.filter((a) => a.status !== 'cancelled' && ((loc && a.storeId === loc) || a.ownerUid === profile.uid)).sort((a, b) => a.startAt - b.startAt);
  if (!mine.length) return null;
  const left = mine.filter((a) => a.status === 'booked' && a.endAt > now).length;

  return (
    <Card>
      <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Event color="primary" />
          <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>
            Appointments today{loc ? ` · ${storeName(loc)}` : ''} — {mine.length}{left && left !== mine.length ? ` (${left} still to come)` : ''}
          </Typography>
          <Button size="small" onClick={() => navigate('/mp/appointments')}>Open</Button>
        </Box>
        {mine.map((a) => <ApptRow key={a.id} a={a} showStore={!loc || a.storeId !== loc} />)}
      </CardContent>
    </Card>
  );
};

export default AppointmentsTodayCard;
