// "Sell more" release — frame for customer-facing pages (quote, booking, trade-in, pre-qualification, referral).
// No sign-in; mobile first; TIGON colors.
import React from 'react';
import { Box, Button, Container, Typography } from '@mui/material';
import { Call } from '@mui/icons-material';

const PublicShell: React.FC<{ title?: string; subtitle?: string; phone?: string; children: React.ReactNode }> = ({ title, subtitle, phone, children }) => (
  <Box sx={{ minHeight: '100vh', bgcolor: '#f5f6f8', color: '#222' }}>
    <Box component="header" sx={{ bgcolor: '#0e4671', color: '#fff', borderBottom: '6px solid #af1f31' }}>
      <Container maxWidth="md" sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component="a" href="https://tigongolfcarts.com" sx={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 0.75, flexGrow: 1 }}>
          <Typography component="span" sx={{ fontWeight: 900, fontSize: 26, letterSpacing: 1 }}>TIGON</Typography>
          <Typography component="span" sx={{ fontWeight: 600, fontSize: 12 }}>GOLF CARTS</Typography>
        </Box>
        {phone && (
          <Button variant="contained" color="primary" startIcon={<Call />} href={`tel:${phone.replace(/[^\d+]/g, '')}`}>Call</Button>
        )}
      </Container>
    </Box>
    <Container maxWidth="md" sx={{ py: 3 }}>
      {title && <Typography variant="h4" sx={{ fontWeight: 800, color: '#0e4671', mb: subtitle ? 0.5 : 2, fontSize: { xs: 26, sm: 32 } }}>{title}</Typography>}
      {subtitle && <Typography color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>}
      {children}
    </Container>
    <Box component="footer" sx={{ textAlign: 'center', py: 3, color: 'text.secondary', fontSize: 13 }}>
      TIGON Golf Carts · <a href="https://tigongolfcarts.com" style={{ color: 'inherit' }}>tigongolfcarts.com</a> · 1-844-844-6638
    </Box>
  </Box>
);

export default PublicShell;
