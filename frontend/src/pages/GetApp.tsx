import React from 'react';
import { Container, Typography } from '@mui/material';
import AppDownload from '../devices/AppDownload';

/** Public page (no sign-in): tigoniot.com/app — for phones that don't have the app yet. */
const GetApp: React.FC = () => (
  <Container maxWidth="md" sx={{ py: 3 }}>
    <Typography variant="h4" color="primary" sx={{ fontWeight: 700, mb: 2 }}>Get the TIGON IOT app</Typography>
    <AppDownload />
  </Container>
);

export default GetApp;
