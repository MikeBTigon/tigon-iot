// Insights — /mp/customer/:phone — the customer timeline as a page (any phone format in the URL).
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, TextField, Typography } from '@mui/material';
import { Timeline } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CustomerTimeline from './CustomerTimeline';
import { customerPath, toE164 } from './phone';

const CustomerPage: React.FC = () => {
  const { phone = '' } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const raw = decodeURIComponent(phone);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const p = customerPath(q);
    if (p) navigate(p);
  };
  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Timeline color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Customer history</Typography>
        <Box component="form" onSubmit={go} sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" label="Look up a phone number" value={q} onChange={(e) => setQ(e.target.value)} inputMode="tel" sx={{ width: 200 }} />
          <Button type="submit" variant="outlined" disabled={!toE164(q)}>Go</Button>
        </Box>
      </Box>
      {raw ? <CustomerTimeline phone={raw} /> : <Typography color="text.secondary">Type a phone number to see everything about that customer.</Typography>}
    </MpShell>
  );
};

export default CustomerPage;
