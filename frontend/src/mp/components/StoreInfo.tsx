import React from 'react';
import { Box, Button, Link, Paper, Typography } from '@mui/material';
import { Facebook, Language, Map, Phone, RateReview, YouTube } from '@mui/icons-material';
import { DEALERSHIP_BY_ID } from '../constants';

/** Dealership details for a T-location. */
const StoreInfo: React.FC<{ locationId: string; compact?: boolean }> = ({ locationId, compact }) => {
  const d = DEALERSHIP_BY_ID[locationId];
  if (!d) return null;
  const links = [
    { href: d.maps, label: 'Map', icon: <Map /> },
    { href: d.website, label: 'Website', icon: <Language /> },
    { href: d.facebook, label: 'Facebook', icon: <Facebook /> },
    { href: d.youtube, label: 'YouTube', icon: <YouTube /> },
    { href: d.review, label: 'Reviews', icon: <RateReview /> },
  ].filter((l) => l.href);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" color="primary">{d.id} · TIGON {d.name}</Typography>
      <Typography color="text.secondary">{d.address}</Typography>
      <Link href={`tel:${d.phone.replace(/[^\d+]/g, '')}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
        <Phone fontSize="small" /> {d.phone}
      </Link>
      {!compact && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
          {links.map((l) => (
            <Button key={l.label} size="small" variant="outlined" startIcon={l.icon} href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
            </Button>
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default StoreInfo;
