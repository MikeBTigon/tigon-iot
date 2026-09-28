import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Call, Sms } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { smsHref, telHref, type PublicStorefront } from './api';

/** Branded public header: logo, storefront title/tagline and call/text buttons. */
const StorefrontHeader: React.FC<{ storefront: PublicStorefront | null; slug: string; textBody?: string }> = ({ storefront, slug, textBody }) => (
  <Box component="header" sx={{ bgcolor: '#0e4671', color: '#fff', borderBottom: '6px solid #af1f31' }}>
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Box component={RouterLink} to={`/s/${slug}`} sx={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Typography component="span" sx={{ fontWeight: 900, fontSize: 28, letterSpacing: 1 }}>TIGON</Typography>
        <Typography component="span" sx={{ fontWeight: 600, fontSize: 12 }}>GOLF CARTS</Typography>
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 160 }}>
        {storefront && (
          <>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{storefront.title}</Typography>
            {storefront.tagline && <Typography variant="body2" sx={{ opacity: 0.85 }}>{storefront.tagline}</Typography>}
          </>
        )}
      </Box>
      {storefront?.phone && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" color="primary" startIcon={<Call />} href={telHref(storefront.phone)}>Call</Button>
          <Button variant="outlined" startIcon={<Sms />} href={smsHref(storefront.phone, textBody || 'Hi! I saw your golf carts online.')}
            sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }}>
            Text
          </Button>
        </Box>
      )}
    </Box>
  </Box>
);

export default StorefrontHeader;
