import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import { ArrowBack, Phone, Place } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CartGrid from '../components/CartGrid';
import StoreInfo from '../components/StoreInfo';
import { useMp } from '../MpDataContext';
import { isPostedBy, masterSort } from '../cartUtils';
import { DEALERSHIP_BY_ID, DEALERSHIPS, locationName, locationRank } from '../constants';

const MpLocations: React.FC = () => {
  const { loc } = useParams();
  const navigate = useNavigate();
  const { carts, brokenPhotos, userKeys } = useMp();
  const live = useMemo(() => carts.filter((c) => !c.flaggedDelete), [carts]);

  const tiles = useMemo(() => {
    const m = new Map<string, { total: number; used: number; unposted: number }>();
    // Every dealership gets a tile, even with no inventory right now.
    for (const d of DEALERSHIPS) m.set(d.id, { total: 0, used: 0, unposted: 0 });
    for (const c of live) {
      const t = m.get(c.locationId) || { total: 0, used: 0, unposted: 0 };
      t.total++;
      if (c.isUsed) t.used++;
      if (!isPostedBy(c, userKeys)) t.unposted++;
      m.set(c.locationId, t);
    }
    return [...m.entries()].sort((a, b) => locationRank(a[0]) - locationRank(b[0]));
  }, [live, userKeys]);

  const here = useMemo(() => (loc ? masterSort(live.filter((c) => c.locationId === loc), brokenPhotos) : []), [live, loc, brokenPhotos]);

  if (loc) {
    const used = here.filter((c) => c.isUsed);
    const fresh = here.filter((c) => !c.isUsed);
    return (
      <MpShell>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/mp/locations')} sx={{ mb: 1 }}>All locations</Button>
        <Typography variant="h5" gutterBottom>{loc} · {locationName(loc)}</Typography>
        <Box sx={{ mb: 2 }}><StoreInfo locationId={loc} /></Box>
        <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Used ({used.length})</Typography>
        <CartGrid carts={used} empty="No used carts here." />
        <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>New ({fresh.length})</Typography>
        <CartGrid carts={fresh} empty="No new carts here." />
      </MpShell>
    );
  }

  return (
    <MpShell>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {tiles.map(([id, t]) => (
          <Card key={id}>
            <CardActionArea onClick={() => navigate(`/mp/locations/${encodeURIComponent(id)}`)}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Place color="primary" />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{id}</Typography>
                </Box>
                <Typography color="text.secondary">{DEALERSHIP_BY_ID[id]?.name || locationName(id)}</Typography>
                {DEALERSHIP_BY_ID[id] && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <Phone sx={{ fontSize: 14 }} /> {DEALERSHIP_BY_ID[id].phone}
                  </Typography>
                )}
                <Typography variant="body2">{t.total} carts · {t.used} used</Typography>
                <Typography variant="body2" color="primary">{t.unposted} not posted by you</Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      {!tiles.length && <Typography color="text.secondary">No inventory yet — it syncs from the DMS automatically every hour.</Typography>}
    </MpShell>
  );
};

export default MpLocations;
