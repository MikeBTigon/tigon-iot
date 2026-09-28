import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { Storefront } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import { useMp } from '../MpDataContext';

/** Summary of the MP Assistant shown on the main IoT dashboard. */
const MpDashboardCard: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useMp();
  const [stats, setStats] = useState<{ total: number; mine: number } | null>(null);

  useEffect(() => {
    if (!profile) return;
    const carts = collection(db, COLLECTIONS.carts);
    Promise.all([
      getCountFromServer(carts),
      getCountFromServer(query(carts, where(`postedBy.${profile.uid}`, '>', 0))),
    ])
      .then(([t, m]) => setStats({ total: t.data().count, mine: m.data().count }))
      .catch(() => setStats(null));
  }, [profile]);

  return (
    <Card sx={{ mb: 4, borderLeft: '4px solid', borderColor: 'secondary.main' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Storefront sx={{ fontSize: 48, color: 'secondary.main' }} />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">MP Assistant — Facebook Marketplace</Typography>
          <Typography variant="body2" color="text.secondary">
            {!profile
              ? 'Post DMS inventory to Marketplace with generated listings and account tracking.'
              : stats
                ? `${stats.total} carts in inventory · ${stats.mine} posted by you · ${Math.max(0, stats.total - stats.mine)} to go`
                : 'Loading inventory…'}
          </Typography>
        </Box>
        <Button variant="contained" color="secondary" onClick={() => navigate('/mp')}>
          {profile ? 'Open MP Assistant' : 'Set up MP Assistant'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MpDashboardCard;
