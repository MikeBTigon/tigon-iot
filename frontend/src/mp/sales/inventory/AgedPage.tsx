// Track 4 (inventory) — placeholder (replaced by the track).
import React from 'react';
import { Alert, Typography } from '@mui/material';
import MpShell from '../../components/MpShell';

const AgedPage: React.FC = () => (
  <MpShell>
    <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 2 }}>Aged inventory</Typography>
    <Alert severity="info">Coming soon.</Alert>
  </MpShell>
);

export default AgedPage;
