// Track 3 (closing tools) — placeholder (replaced by the track).
import React from 'react';
import { Alert, Typography } from '@mui/material';
import MpShell from '../../components/MpShell';

const TradeInsPage: React.FC = () => (
  <MpShell>
    <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 2 }}>Trade-ins</Typography>
    <Alert severity="info">Coming soon.</Alert>
  </MpShell>
);

export default TradeInsPage;
