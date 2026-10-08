// "Sell more" release — top of the Dashboard "This Device" tab: who to call today + today's appointments.
import React from 'react';
import { Stack } from '@mui/material';
import TodayCard from './speed/TodayCard';
import AppointmentsTodayCard from './closing/AppointmentsTodayCard';

const DeviceSalesCards: React.FC = () => (
  <Stack spacing={2} sx={{ mb: 3 }}>
    <TodayCard />
    <AppointmentsTodayCard />
  </Stack>
);

export default DeviceSalesCards;
