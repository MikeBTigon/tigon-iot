// Track 5 (marketing & managers) — placeholder (replaced by the track).
import React from 'react';
import { Alert, Typography } from '@mui/material';
import MpShell from '../../components/MpShell';

const ReferralsPage: React.FC = () => (
  <MpShell>
    <Typography variant="h5" color="primary" sx={{ fontWeight: 700, mb: 2 }}>Referrals</Typography>
    <Alert severity="info">Coming soon.</Alert>
  </MpShell>
);

export default ReferralsPage;
