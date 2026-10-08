// Track 1 (speed to lead) — placeholder (replaced by the track).
import React from 'react';
import { Alert, Typography } from '@mui/material';
import MpShell from '../../components/MpShell';

const TodayPage: React.FC = () => (
  <MpShell>
    <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 2 }}>Today</Typography>
    <Alert severity="info">Coming soon.</Alert>
  </MpShell>
);

export default TodayPage;
